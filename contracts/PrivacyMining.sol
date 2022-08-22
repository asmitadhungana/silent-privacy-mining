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
    bytes32 public constant VOUCHER_REWARD_TYPE = 0xf79b27aba54838c88035ff9fd9c8eee7bd3e841fb3aed06136ba6522c8c863af; //keccak256("VOUCHER_REWARD_TYPE");
    bytes32 public constant STAKING_REWARD_TYPE = 0x0558e63b96f672882ddecb8628c4bf879a253f9fce5b3bbf75eeddb18e554abf; //keccak256("STAKING_REWARD_TYPE");

    struct Pool {
        uint256 phase;
        uint256 globalAssetsDeposit;
        uint256 globalSilentStaked;
        uint256 totalVouchersClaimed;
    }
    // assetId => Pool
    mapping(uint256 => Pool) public pools;
    uint256[] private deployedPools;

    struct Reward {
        address rewardsDistributor;
        uint256 rewardsDuration;
        uint256 periodFinish;
        uint256 rewardRate;
        uint256 lastUpdateTime; // The last time the contract was called for deposit
        uint256 rewardPerTokenStored;   // s value = summation of rewardRate/pool.globalAssets for each reward type at each given time; 
                                        // calculated each time an interaction is made by any user
    }

    // assetId => rewardType => Reward [VoucherReward/StakingReward]
    mapping(uint256 => mapping(bytes32 => Reward)) public rewardForPool;

    // user => assetId => rewardType => balance (userLifetimeAssetDeposit/userPoolSilentStakes)
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) userPoolBalance;
    // user => assetId => rewardType => reward (voucherReward/stakingReward)
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) userPoolReward;

    // user => assetId => rewardType => userRewardPerTokenPaid; [userPoolVoucherRewardPerTokenPaid/userPoolStakingRewardPerTokenPaid]
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) userPoolRewardPerTokenPaid;
    // user => assetId => rewardType => userPoolPendingRewards [userPoolVoucherRewards/userPoolStakingRewards]
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) userPoolRewards;

    // user => assetId => userPoolVoucherBalance [Amt of vouchers claimed by a user for a pool
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

    // @notice fetches the current phase of a pool
    function getPoolPhase(uint256 assetId) external view returns (uint256) {
        return pools[assetId].phase;
    }

    // @notice fetches the total amount of Assets deposited by depositors in the SMASP
    function getPoolGlobalAssetsDeposits(uint256 assetId) external view returns (uint256) {
        return pools[assetId].globalAssetsDeposit;
    }

    // @notice fetches the total amount of Silent tokens staked by voucher owners in a pool
    function getPoolGlobalSilentStaked(uint256 assetId) external view returns (uint256) {
        return pools[assetId].globalSilentStaked;
    }

    // @notice fetches the total amount of Vouchers claimed by depositors from an asset pool
    function getPoolGlobalVouchersClaimed(uint256 assetId) external view returns (uint256) {
        return pools[assetId].totalVouchersClaimed;
    }

    // @notice fetches the amount of Assets ever deposited by the caller in a pool
    function getuserPoolLifetimeAssetDeposits(uint256 assetId) external view returns (uint256) {
        return userPoolBalance[msg.sender][assetId][VOUCHER_REWARD_TYPE];
    }

    // @notice fetches the amount of Silent tokens staked by the caller in a pool
    function getuserPoolSilentStaked(uint256 assetId) external view returns (uint256) {
        return userPoolBalance[msg.sender][assetId][STAKING_REWARD_TYPE];
    }


    /* ========== MUTATIVE FUNCTIONS ========== */


    // @notice registers user's deposit in SMASP for the asset to the pool
    function depositAssetToPool(address user, uint256 assetId, uint256 amount) external onlyPhaseI(assetId) updateReward(user, assetId, VOUCHER_REWARD_TYPE) {
        require(msg.sender == smaspContract, "Only SMASP can call this");

        pools[assetId].globalAssetsDeposit += amount;
        userPoolBalance[user][assetId][VOUCHER_REWARD_TYPE] += amount;
        emit AssetDepositedToPool(user, assetId, amount);
    }

    // @notice lets user stake their silent tokens to a pool
    function stakeSilentToPool(uint256 assetId, uint256 amount) external onlyPhaseII(assetId) updateReward(msg.sender, assetId, STAKING_REWARD_TYPE) {
        require(amount > 0, "Cannot stake 0");
        pools[assetId].globalSilentStaked += amount;
        
        userPoolBalance[msg.sender][assetId][STAKING_REWARD_TYPE] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        // Assert that the total balance of PMC matches
        emit SilentStakedInPool(msg.sender, assetId, amount);
    }

    // @notice lets user unstake their silent tokens from a pool
    function unstakeSilent(uint256 assetId, uint256 amount) external onlyPhaseII(assetId) updateReward(msg.sender, assetId, STAKING_REWARD_TYPE) {
        require(amount > 0, "Cannot stake 0");
        pools[assetId].globalSilentStaked -= amount;

        userPoolBalance[msg.sender][assetId][STAKING_REWARD_TYPE] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        // Assert that the total balance of PMC matches
        emit SilentUnstakedFromPool(msg.sender, assetId, amount);
    }

    // @notice lets a user claim accumulated rewards
    function claimRewards(uint256 assetId, bytes32 rewardType) external updateReward(msg.sender, assetId, rewardType) {
        uint reward = userPoolRewards[msg.sender][assetId][rewardType];
        
        if (reward > 0) {
            userPoolRewards[msg.sender][assetId][rewardType] = 0;
            if (rewardType == VOUCHER_REWARD_TYPE) {
                require(pools[assetId].phase == 1, "Pool not in Phase I");
                userPoolVoucherBalance[msg.sender][assetId] += reward;
                pools[assetId].totalVouchersClaimed += reward;
                return;
            }
            stakingToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, assetId, rewardType, reward);
        }
    }

    // @notice computes the last reward claimable time for a user
    function lastTimeRewardApplicable(uint256 assetId, bytes32 rewardType) public view returns (uint256) {
        return Math.min(block.timestamp, rewardForPool[assetId][rewardType].periodFinish);
    }

    // @notice computes the running sum of R/globalAssetsDeposit 
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

    // @notice computes the claimable rewards for a user
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


    // @notice updates the reward each time any user interacts with the SC [ deposit, stake, unstake, claim]
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

    // @notice fetches information of all assset reward pools ever created in the PMC
    function getDeployedPools() external view returns (Pool[] memory) {
        uint256 deployedPoolsLength = deployedPools.length;
        uint256 i;
        Pool[] memory pool = new Pool[](deployedPoolsLength);
        for (i=0; i<deployedPoolsLength; i++) {
            pool[i] = pools[deployedPools[i]];
        }
        return pool;
    }

    // @notice lets the owner of the pool (or maybe SMASP?) create a new Asset-Reward Pool
    // @dev rewardRate at the moment can't handle floating point value
    function createAssetRewardPool(uint256 assetId, uint256 totalVoucherRewards, uint256 rewardDuration) external onlyOwner {
        // Check that the pool hasn't already been deployed/created
        require(pools[assetId].phase == 0, "Asset pool already created");
        // Create a new pool
        pools[assetId].phase = 1;

        // compute the rewardRate
        uint256 rewardRate = totalVoucherRewards/rewardDuration;

        // Initialize the Voucher rewards for the pool
        rewardForPool[assetId][VOUCHER_REWARD_TYPE] = Reward(
            msg.sender,
            rewardDuration,
            block.timestamp + rewardDuration,
            rewardRate,
            0,
            0
        );

        deployedPools.push(assetId);
    }

    // @notice lets the owner of the contract terminate pahse I for a pool and initiate phase II
    function terminatePhaseI(uint256 assetId, uint256 totalSilentRewards, uint256 rewardDuration) external onlyPhaseI(assetId) onlyOwner {
        // Ensure that the voucherReward's periodFinish has passed
        require(block.timestamp >= rewardForPool[assetId][VOUCHER_REWARD_TYPE].periodFinish, "Pool's Voucher Distribution Ongoing");
        // Change the phase of the pool to 2
        pools[assetId].phase = 2;

        // Compute the rewardRate
        uint256 rewardRate = totalSilentRewards/rewardDuration;

        // Initialize the reward for the pool
        rewardForPool[assetId][STAKING_REWARD_TYPE] = Reward(
            msg.sender,
            rewardDuration,
            block.timestamp + rewardDuration,
            rewardRate,
            0,
            0
        );
    }


    /* ========== RESTRICTED FUNCTIONS ========== */


    // @notice lets the rewardDistributor of an asset reward pool initialize a new reward period
    function setRewardsDuration(uint256 assetId, bytes32 rewardType, uint256 rewardsDuration, uint256 totalRewards) external {
        if (rewardType == VOUCHER_REWARD_TYPE) {
            require (pools[assetId].phase == 1, "Pool needs to be in Phase I");
        } else {
            require (pools[assetId].phase == 2, "Pool needs to be in Phase II");
        }
        require(
            block.timestamp > rewardForPool[assetId][rewardType].periodFinish,
            "Reward period still active"
        );
        require(rewardForPool[assetId][rewardType].rewardsDistributor == msg.sender);
        require(rewardsDuration > 0, "Reward duration must be non-zero");
        // compute the rewardRate
        uint256 rewardRate = totalRewards/rewardsDuration;
        // Update the Reward of rewardType for the asset pool
        rewardForPool[assetId][rewardType].rewardsDuration = rewardsDuration;
        rewardForPool[assetId][rewardType].periodFinish = block.timestamp + rewardsDuration;
        rewardForPool[assetId][rewardType].rewardRate = rewardRate;
        emit RewardsDurationUpdated(assetId, rewardType, rewardsDuration, rewardRate);
    }

     /* ========== EVENTS ========== */
    event AssetDepositedToPool(address indexeduser, uint256 indexed assetId, uint256 indexed amount);
    event SilentStakedInPool(address indexed user, uint256 assetId, uint256 amount);
    event SilentUnstakedFromPool(address indexed user, uint256 assetId, uint256 amount);
    event RewardPaid(address indexed user, uint256 indexed assetId, bytes32 rewardType, uint256 indexed reward);
    event RewardsDurationUpdated(uint256 assetId, bytes32 rewardType, uint256 rewardsDuration, uint256 rewardRate);
}