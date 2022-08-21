// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/security/ReentrancyGuard.sol";
// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/security/Pausable.sol";
// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol";
// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/math/Math.sol";
// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PrivacyMining is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    IERC20 public stakingToken; // SILENT

    /* ========== STATE VARIABLES ========== */
    address public immutable smaspContract;
    bytes32 public constant VOUCHER_REWARD_TYPE = keccak256("VOUCHER_REWARD_TYPE");
    bytes32 public constant STAKING_REWARD_TYPE = keccak256("STAKING_REWARD_TYPE");

    struct Pool {
        uint phase;
        uint globalAssetsDeposit;
        uint globalSilentStaked;
        uint totalVouchersClaimed;
        // uint phaseOneEndDuration;
    }
    // assetId => Pool
    mapping(uint256 => Pool) public pools;
    Pool[] private deployedPools;

    struct Reward {
        address rewardsDistributor;
        uint256 rewardsDuration;
        uint256 periodFinish;
        uint256 rewardRate;
        uint256 lastUpdateTime; // The last time the contract was called for deposit
        uint256 rewardPerTokenStored;   // s value = summation of rewardRate/pool.globalAssetsDeposit at each given time; 
                                        // calculated each time an interaction is made by any user | here, each time deposit() is called
    }

    // assetId => rewardType => Reward [VoucherReward/StakingReward]
    mapping(uint256 => mapping(bytes32 => Reward)) public rewardForPool;

    // user => assetId => rewardType => balance (userLifetimeAssetDeposit/userPoolSilentStakes)
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) userPoolBalance; // better name [?]
    // user => assetId => rewardType => reward (voucherReward/stakingReward)
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) userPoolReward;

    // user => assetId => rewardType => userRewardPerTokenPaid; [userPoolVoucherRewardPerTokenPaid/userPoolStakingRewardPerTokenPaid]
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) userPoolRewardPerTokenPaid;
    // user => assetId => rewardType => userPoolPendingRewards [userPoolVoucherRewards/userPoolStakingRewards]
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) userPoolRewards;

    // user => assetId => userPoolVoucherBalance
    mapping(address => mapping(uint256 => uint256)) userPoolVoucherBalance;


    /* ========== CONSTRUCTOR ========== */


    constructor(
        address _stakingToken,
        address _smaspContract
    ) {
        stakingToken = IERC20(_stakingToken);
        smaspContract = _smaspContract;
    }


    /* ========== VIEW FUNCTIONS ========== */
    

    // @dev fetches the current phase of a pool
    function getPoolPhase(uint256 assetId) external view returns (uint256) {
        return pools[assetId].phase;
    }

    // @dev fetches the total amount of Assets deposited by depositors in the SMASP
    function getPoolGlobalAssetsDeposits(uint256 assetId) external view returns (uint256) {
        return pools[assetId].globalAssetsDeposit;
    }

    // @dev fetches the total amount of Silent tokens staked by voucher owners in a pool
    function getPoolGlobalSilentStaked(uint256 assetId) external view returns (uint256) {
        return pools[assetId].globalSilentStaked;
    }

    // @dev fetches the total amount of Vouchers claimed by depositors from an asset pool
    function getPoolGlobalVouchersClaimed(uint256 assetId) external view returns (uint256) {
        return pools[assetId].totalVouchersClaimed;
    }

    // @dev fetches the amount of Assets ever deposited by the caller in a pool
    function getuserPoolLifetimeAssetDeposits(uint256 assetId) external view returns (uint256) {
        return userPoolBalance[msg.sender][assetId][VOUCHER_REWARD_TYPE];
    }

    // @dev fetches the amount of Silent tokens staked by the caller in a pool
    function getuserPoolSilentStaked(uint256 assetId) external view returns (uint256) {
        return userPoolBalance[msg.sender][assetId][STAKING_REWARD_TYPE];
    }


    /* ========== MUTATIVE FUNCTIONS ========== */


    // @dev registers user's deposit in SMASP for the asset to the pool
    function depositAssetToPool(address user, uint256 assetId, uint256 amount) external onlyPhaseI(assetId) updateReward(user, assetId, VOUCHER_REWARD_TYPE) {
        // require(msg.sender == smaspContract, "Only SMASP can call this");

        pools[assetId].globalAssetsDeposit += amount;
        userPoolBalance[user][assetId][VOUCHER_REWARD_TYPE] += amount;
        emit AssetDepositedToPool(user, assetId, amount);
    }

    // @dev lets user stake their silent tokens to a pool
    function stakeSilentToPool(uint256 assetId, uint256 amount) external onlyPhaseII(assetId) updateReward(msg.sender, assetId, STAKING_REWARD_TYPE) {
        require(amount > 0, "Cannot stake 0");
        pools[assetId].globalSilentStaked += amount;
        
        userPoolBalance[msg.sender][assetId][STAKING_REWARD_TYPE] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        // Assert that the total balance of PMC matches
        emit SilentStakedInPool(msg.sender, assetId, amount);
    }

    // @dev lets user unstake their silent tokens from a pool
    function unstakeSilent(uint256 assetId, uint256 amount) external onlyPhaseII(assetId) updateReward(msg.sender, assetId, STAKING_REWARD_TYPE) {
        require(amount > 0, "Cannot stake 0");
        pools[assetId].globalSilentStaked -= amount;

        userPoolBalance[msg.sender][assetId][STAKING_REWARD_TYPE] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        // Assert that the total balance of PMC matches
        emit SilentUnstakedFromPool(msg.sender, assetId, amount);
    }

    // @dev lets a user claim accumulated rewards
    function claimRewards(uint256 assetId, bytes32 rewardType) external updateReward(msg.sender, assetId, rewardType) {
        uint reward = userPoolRewards[msg.sender][assetId][rewardType];
        
        if (reward > 0) {
            userPoolRewards[msg.sender][assetId][rewardType] = 0;
            if (rewardType == VOUCHER_REWARD_TYPE) {
                require(pools[assetId].phase == 1, "Pool not in Phase I"); // Maybe keep it in updateVoucherReward [?]
                userPoolVoucherBalance[msg.sender][assetId] += reward;
                pools[assetId].totalVouchersClaimed += reward;
                return;
            }
            stakingToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, assetId, rewardType, reward);
        }
    }

    // @dev computes the last reward claimable time for a user
    function lastTimeRewardApplicable(uint256 assetId, bytes32 rewardType) public view returns (uint256) {
        return Math.min(block.timestamp, rewardForPool[assetId][rewardType].periodFinish);
    }

    // @dev computes the running sum of R/globalAssetsDeposit 
    function rewardPerToken(uint256 assetId, bytes32 rewardType) public view returns (uint) {
        if (pools[assetId].globalAssetsDeposit == 0) {
            return rewardForPool[assetId][rewardType].rewardPerTokenStored;
        }

        Reward memory _rewardForPool = rewardForPool[assetId][rewardType];

        if ( rewardType == STAKING_REWARD_TYPE) {
            return _rewardForPool.rewardPerTokenStored + (
                (lastTimeRewardApplicable(assetId, rewardType) - _rewardForPool.lastUpdateTime) * _rewardForPool.rewardRate * 1e18 / (pools[assetId].globalSilentStaked * pools[assetId].totalVouchersClaimed)
            );
        }
        return _rewardForPool.rewardPerTokenStored + (
            (lastTimeRewardApplicable(assetId, rewardType) - _rewardForPool.lastUpdateTime) * _rewardForPool.rewardRate * 1e18 / pools[assetId].globalAssetsDeposit
        );
    }

    // @dev computes the claimable rewards for a user
    function rewardsPending(address user, uint256 assetId, bytes32 rewardType) public view returns (uint) {
        uint256 userEffectivePoolShare;
        if ( rewardType == STAKING_REWARD_TYPE) {
            userEffectivePoolShare = userPoolBalance[msg.sender][assetId][rewardType] * userPoolVoucherBalance[msg.sender][assetId];
        } else {
            userEffectivePoolShare = userPoolBalance[msg.sender][assetId][rewardType];
        }
        return (
            userEffectivePoolShare * (rewardPerToken(assetId, rewardType) - userPoolRewardPerTokenPaid[user][assetId][rewardType]) / 1e18
        ) + userPoolRewards[msg.sender][assetId][rewardType];
    }
    

    /* ========== MODIFIERS ========== */


    // @dev updates the reward each time any user interacts with the SC [ deposit, stake, unstake, claim]
    modifier updateReward(address user, uint256 assetId, bytes32 rewardType) {
        // Update the reward
        rewardForPool[assetId][rewardType].rewardPerTokenStored = rewardPerToken(assetId, rewardType); // need to change here conditionally
        rewardForPool[assetId][rewardType].lastUpdateTime = block.timestamp;

        // compute the amount of token that the user can claim so far and store the o/p in the rewards of the user
        userPoolRewards[msg.sender][assetId][rewardType] = rewardsPending(msg.sender, assetId, rewardType );
        // lastly, update the userRewardPerTokenPaid of the user for the assetId setting to it to rewardPerTokenStored for the asset computed above
        userPoolRewardPerTokenPaid[msg.sender][assetId][rewardType] = rewardForPool[assetId][rewardType].rewardPerTokenStored;
        _;
    }

    modifier onlyPhaseI(uint256 assetId) {
        require(pools[assetId].phase == 1, "Pool should be in phase I");
        _;
    }

    modifier onlyPhaseII(uint256 assetId) {
        require(pools[assetId].phase == 2, "Pool should be in phase II");
        _;
    }


    /* ========== GLOBAL FUNCTIONS ========== */


    function getDeployedPools() external view returns (Pool[] memory) {
        // PENDING IMPLEMENTATION
    }

    // @dev lets the owner of the pool (or maybe SMASP?) create a new Asset-Reward Pool
    function createAssetRewardPool(uint256 assetId) external onlyOwner {
        // Check that the pool hasn't already been deployed/created
        require(pools[assetId].phase == 0, "Asset pool already created");
        // Create a new pool
        pools[assetId].phase = 1;

        // Initialize the Voucher rewards for the pool
        rewardForPool[assetId][VOUCHER_REWARD_TYPE] = Reward(
            msg.sender,
            24*3600,
            block.timestamp + 24*3600,
            1,
            0,
            0
        );
    }

    // phase1End: maybe after GlobalAssetDeposit reaches a certain value [?]
    // @dev lets the owner of the contract terminate pahse I
    function terminatePhaseI(uint256 assetId, uint256 totalSilentDistributable, uint256 vestingDuration) external onlyPhaseI(assetId) onlyOwner {
        // Ensure that the pool's phase1's endTime is over => KEEP A STATE in Pool [?] |
        // Ensure that the voucherReward's periodFinish has passed
        bytes32 rewardType = STAKING_REWARD_TYPE;
        require(block.timestamp >= rewardForPool[assetId][rewardType].periodFinish, "Pool's Voucher Distribution Ongoing");
        
        pools[assetId].phase = 2;

        // Compute the rewardRate
        uint256 rewardRate = totalSilentDistributable/vestingDuration;

        rewardForPool[assetId][rewardType] = Reward(
            msg.sender,
            24*3600,
            block.timestamp + 24*3600,
            rewardRate,
            0,
            0
        );
    }


    /* ========== RESTRICTED FUNCTIONS ========== */


    function setRewardsDuration(uint256 assetId, bytes32 rewardType, uint256 rewardsDuration) external {
        require(
            block.timestamp > rewardForPool[assetId][rewardType].periodFinish,
            "Reward period still active"
        );
        require(rewardForPool[assetId][rewardType].rewardsDistributor == msg.sender);
        require(rewardsDuration > 0, "Reward duration must be non-zero");
        rewardForPool[assetId][rewardType].rewardsDuration = rewardsDuration;
        emit RewardsDurationUpdated(assetId, rewardType, rewardsDuration);
    }


    /* ========== EVENTS ========== */


    event AssetDepositedToPool(address indexeduser, uint256 indexed assetId, uint256 indexed amount);
    event SilentStakedInPool(address indexed user, uint256 assetId, uint256 amount);
    event SilentUnstakedFromPool(address indexed user, uint256 assetId, uint256 amount);
    event RewardPaid(address indexed user, uint256 indexed assetId, bytes32 rewardType, uint256 indexed reward);
    event RewardsDurationUpdated(uint256 assetId, bytes32 rewardType, uint256 rewardsDuration);
}