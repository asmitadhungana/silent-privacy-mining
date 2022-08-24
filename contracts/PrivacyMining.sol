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

error RewardPeriodFinished();
error OnlyCallableInPhaseOne();
error OnlyCallableInPhaseTwo();

contract PrivacyMining is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */
    bytes32 public constant VOUCHER_REWARD_TYPE = 0xf79b27aba54838c88035ff9fd9c8eee7bd3e841fb3aed06136ba6522c8c863af; //keccak256("VOUCHER_REWARD_TYPE");
    bytes32 public constant STAKING_REWARD_TYPE = 0x0558e63b96f672882ddecb8628c4bf879a253f9fce5b3bbf75eeddb18e554abf; //keccak256("STAKING_REWARD_TYPE");
    IERC20 public immutable stakingToken; // SILENT
    address public immutable smsapContract;

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

    // user pool state by reward type
    struct UserPoolState {
        uint256 userPoolBalance;
        uint256 userPoolRewardPerTokenPaid;
        uint256 userPoolRewards;
    }

    // userAddress => assetId => rewardType => UserPoolState
    mapping(address => mapping(uint256 => mapping(bytes32 => UserPoolState))) public userPoolState;

    // user => assetId => userPoolVoucherBalance [Amt of vouchers claimed by a user for a pool
    mapping(address => mapping(uint256 => uint256)) public userPoolVoucherBalance;


    /* ========== CONSTRUCTOR ========== */


    constructor(
        address _stakingToken,
        address _smsapContract
    ) {
        require(_stakingToken != address(0) && _smsapContract != address(0), "Invalid Contract Addresses");
        stakingToken = IERC20(_stakingToken);
        smsapContract = _smsapContract;
    }


    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    // @notice fetches the current phase of a pool
    function getPoolPhase(uint256 assetId) external view returns (uint256) {
        return pools[assetId].phase;
    }

    // @notice fetches the total amount of Assets deposited by depositors in the SMSAP
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
        return userPoolState[msg.sender][assetId][VOUCHER_REWARD_TYPE].userPoolBalance;
    }

    // @notice fetches the amount of Silent tokens staked by the caller in a pool
    function getuserPoolSilentStaked(uint256 assetId) external view returns (uint256) {
        return userPoolState[msg.sender][assetId][STAKING_REWARD_TYPE].userPoolBalance;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */


    // @notice registers user's deposit in SMSAP for the asset to the pool
    // @dev revert early if the reward period has finished to save gas for user
    function depositAssetToPool(address user, uint256 assetId, uint256 amount) external onlyPhaseI(assetId) updateReward(user, assetId, VOUCHER_REWARD_TYPE) {
        require(msg.sender == smsapContract, "Only SMSAP can call this");
        // Ensure that the Reward.periodFinish hasn't passed already
        if(block.timestamp > rewardForPool[assetId][VOUCHER_REWARD_TYPE].periodFinish) revert RewardPeriodFinished();

        pools[assetId].globalAssetsDeposit += amount;
        userPoolState[user][assetId][VOUCHER_REWARD_TYPE].userPoolBalance += amount;
        emit AssetDepositedToPool(user, assetId, amount);
    }

    // @notice lets user stake their silent tokens to a pool
    function stakeSilentToPool(uint256 assetId, uint256 amount) external onlyPhaseII(assetId) updateReward(msg.sender, assetId, STAKING_REWARD_TYPE) {
        require(amount > 0, "Cannot stake 0");
        pools[assetId].globalSilentStaked += amount;
        
        userPoolState[msg.sender][assetId][STAKING_REWARD_TYPE].userPoolBalance += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        // Assert that the total balance of PMC matches
        emit SilentStakedInPool(msg.sender, assetId, amount);
    }

    // @notice lets user unstake their silent tokens from a pool
    function unstakeSilent(uint256 assetId, uint256 amount) external onlyPhaseII(assetId) updateReward(msg.sender, assetId, STAKING_REWARD_TYPE) {
        require(amount > 0, "Cannot stake 0");
        pools[assetId].globalSilentStaked -= amount;

        userPoolState[msg.sender][assetId][STAKING_REWARD_TYPE].userPoolBalance -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        // Assert that the total balance of PMC matches
        emit SilentUnstakedFromPool(msg.sender, assetId, amount);
    }

    // @notice lets a user claim accumulated rewards
    function claimRewards(uint256 assetId, bytes32 rewardType) external updateReward(msg.sender, assetId, rewardType) {
        uint reward = userPoolState[msg.sender][assetId][rewardType].userPoolRewards;
        
        if (reward > 0) {
            userPoolState[msg.sender][assetId][rewardType].userPoolRewards = 0;
            if (rewardType == VOUCHER_REWARD_TYPE) {
                if (pools[assetId].phase != 1) revert OnlyCallableInPhaseOne();
                // user can claim until userPoolRewards > 0 | This is updated whenever the user calls deposit/stake/unstake
                // So user can claim only from the last deposited time to the lastRewardApplicable time
                // So the following statement isn't required
                // if(block.timestamp > rewardForPool[assetId][VOUCHER_REWARD_TYPE].periodFinish) revert RewardPeriodFinished();
                userPoolVoucherBalance[msg.sender][assetId] += reward;
                pools[assetId].totalVouchersClaimed += reward;
                return;
            }
            stakingToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, assetId, rewardType, reward);
        }
    }


    /* ========== PUBLIC VIEW FUNCTIONS ========== */


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
        UserPoolState memory _userPoolState = userPoolState[user][assetId][rewardType];
        uint256 userEffectivePoolShare;
        if ( rewardType == STAKING_REWARD_TYPE) {
            userEffectivePoolShare = _userPoolState.userPoolBalance * userPoolVoucherBalance[user][assetId];
        } else {
            userEffectivePoolShare = _userPoolState.userPoolBalance;
        }
        // k*(s-p[user])
        return (
            userEffectivePoolShare * (rewardPerToken(assetId, rewardType) - _userPoolState.userPoolRewardPerTokenPaid) / 1e18
        ) + _userPoolState.userPoolRewards;
    }
    

    /* ========== MODIFIERS ========== */


    // @notice updates the reward each time any user interacts with the SC [ deposit, stake, unstake, claim]
    modifier updateReward(address user, uint256 assetId, bytes32 rewardType) {
        // Update the reward
        rewardForPool[assetId][rewardType].rewardPerTokenStored = rewardPerToken(assetId, rewardType); // need to change here conditionally
        rewardForPool[assetId][rewardType].lastUpdateTime = lastTimeRewardApplicable(assetId, rewardType);

        if (user != address(0)) {
             // compute the amount of token that the user can claim so far and store the o/p in the rewards of the user
            userPoolState[user][assetId][rewardType].userPoolRewards = rewardsPending(user, assetId, rewardType);
            // lastly, update the userRewardPerTokenPaid of the user for the assetId setting to it to rewardPerTokenStored for the asset computed above
            userPoolState[user][assetId][rewardType].userPoolRewardPerTokenPaid = rewardForPool[assetId][rewardType].rewardPerTokenStored;
        }
        _;
    }

    modifier onlyPhaseI(uint256 assetId) {
        if (pools[assetId].phase != 1) revert OnlyCallableInPhaseOne();
        _;
    }

    modifier onlyPhaseII(uint256 assetId) {
        if (pools[assetId].phase != 2) revert OnlyCallableInPhaseTwo();
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


    /* ========== RESTRICTED FUNCTIONS ========== */

    // @notice lets the owner of the pool (or maybe SMSAP?) create a new Asset-Reward Pool of rewardType
    // @dev rewardRate at the moment can't handle floating point value | Extend the function for updating rewards
    function createAssetRewardPool(uint256 assetId, bytes32 rewardType, uint256 reward, uint256 rewardsDuration) external onlyOwner {
        if (rewardType == VOUCHER_REWARD_TYPE) {
            require(pools[assetId].phase == 0, "Asset pool already created");
            pools[assetId].phase = 1;
            deployedPools.push(assetId);
        } else if (rewardType == STAKING_REWARD_TYPE) {
            require(block.timestamp >= rewardForPool[assetId][VOUCHER_REWARD_TYPE].periodFinish, "Phase One Ongoing");
            if (pools[assetId].phase != 1) revert OnlyCallableInPhaseOne();
            pools[assetId].phase = 2;
            // Transfer totalSilentRewards from the owner to the contract [?]
        } else {
            revert();
        }

        // compute the rewardRate
        uint256 rewardRate = reward/rewardsDuration;

        // Initialize the Voucher rewards for the pool
        rewardForPool[assetId][rewardType] = Reward(
            msg.sender,
            rewardsDuration,
            block.timestamp + rewardsDuration,
            rewardRate,
            block.timestamp,
            0
        );
        emit RewardAdded(assetId, rewardType, reward);
    }

    // @notice lets the rewardDistributor of an asset reward pool initialize a new reward period
    function setRewardsDuration(uint256 assetId, bytes32 rewardType, uint256 rewardsDuration) external {
        if (rewardType == VOUCHER_REWARD_TYPE) {
            if (pools[assetId].phase != 1) revert OnlyCallableInPhaseOne();
        } else {
            if (pools[assetId].phase != 2) revert OnlyCallableInPhaseTwo();
        }
        require(
            block.timestamp > rewardForPool[assetId][rewardType].periodFinish,
            "Reward period still active"
        );
        require(rewardForPool[assetId][rewardType].rewardsDistributor == msg.sender, "Caller Not RewardsDistributor");
        require(rewardsDuration > 0, "Reward duration must be non-zero");
        rewardForPool[assetId][rewardType].rewardsDuration = rewardsDuration;
    }

    /* ========== EVENTS ========== */

    event RewardAdded(uint256 indexed assetId, bytes32 indexed rewardType, uint256 indexed reward);
    event AssetDepositedToPool(address indexed user, uint256 indexed assetId, uint256 indexed amount); // Single Event for AssetDeposit and SilentStaked [?]
    event SilentStakedInPool(address indexed user, uint256 assetId, uint256 amount);
    event SilentUnstakedFromPool(address indexed user, uint256 assetId, uint256 amount);
    event RewardPaid(address indexed user, uint256 indexed assetId, bytes32 rewardType, uint256 indexed reward);
    event RewardsDurationUpdated(uint256 assetId, bytes32 rewardType, uint256 rewardsDuration, uint256 rewardRate);
}