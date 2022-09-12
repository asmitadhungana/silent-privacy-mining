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

    bytes32 public constant VOUCHER_REWARD_TYPE =
        0xf79b27aba54838c88035ff9fd9c8eee7bd3e841fb3aed06136ba6522c8c863af; //keccak256("VOUCHER_REWARD_TYPE");
    bytes32 public constant STAKING_REWARD_TYPE =
        0x0558e63b96f672882ddecb8628c4bf879a253f9fce5b3bbf75eeddb18e554abf; //keccak256("STAKING_REWARD_TYPE");
    IERC20 public immutable stakingToken; // SILENT
    address public immutable smaspContract;

    struct Pool {
        uint256 phase;
        uint256 globalAssetsDeposit;
        uint256 globalSilentStaked;
        uint256 totalVouchersClaimed;
    }
    // assetId => Pool
    mapping(uint256 => Pool) public pools;
    uint256[] public deployedPools;

    struct Reward {
        address rewardsDistributor;
        uint256 rewardsDuration;
        uint256 periodFinish;
        uint256 rewardRate;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
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
    mapping(address => mapping(uint256 => mapping(bytes32 => UserPoolState)))
        public userPoolState;

    // user => assetId => userPoolVoucherBalance [Amt of vouchers claimed by a user for a pool]
    mapping(address => mapping(uint256 => uint256))
        public userPoolVoucherBalance;

    /* ========== CONSTRUCTOR ========== */

    constructor(address _stakingToken, address _smaspContract) {
        require(
            _stakingToken != address(0) && _smaspContract != address(0),
            "Invalid Contract Addresses"
        );
        stakingToken = IERC20(_stakingToken);
        smaspContract = _smaspContract;
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    // @notice fetches the current phase of a pool
    function getPoolPhase(uint256 assetId) external view returns (uint256) {
        return pools[assetId].phase;
    }

    // @notice fetches the total amount of Assets deposited by depositors in the SMASP
    function getPoolGlobalAssetsDeposits(uint256 assetId)
        external
        view
        returns (uint256)
    {
        return pools[assetId].globalAssetsDeposit;
    }

    // @notice fetches the total amount of Silent tokens staked by voucher owners in a pool
    function getPoolGlobalSilentStaked(uint256 assetId)
        external
        view
        returns (uint256)
    {
        return pools[assetId].globalSilentStaked;
    }

    // @notice fetches the total amount of Vouchers claimed by depositors from an asset pool
    function getPoolGlobalVouchersClaimed(uint256 assetId)
        external
        view
        returns (uint256)
    {
        return pools[assetId].totalVouchersClaimed;
    }

    // @notice fetches the amount of Assets ever deposited by the caller in a pool
    function getUserPoolLifetimeAssetDeposits(uint256 assetId)
        external
        view
        returns (uint256)
    {
        return
            userPoolState[msg.sender][assetId][VOUCHER_REWARD_TYPE]
                .userPoolBalance;
    }

    // @notice fetches the amount of Silent tokens staked by the caller in a pool
    function getUserPoolSilentStaked(uint256 assetId)
        external
        view
        returns (uint256)
    {
        return
            userPoolState[msg.sender][assetId][STAKING_REWARD_TYPE]
                .userPoolBalance;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // @notice registers user's deposit in SMASP for the asset to the pool
    // @dev better to revert early if the reward period has finished to save gas for user
    function depositAssetToPool(
        address user,
        uint256 assetId,
        uint256 amount
    )
        external
        nonReentrant
        beforePeriodFinished(assetId, VOUCHER_REWARD_TYPE)
        updateReward(user, assetId, VOUCHER_REWARD_TYPE)
    {
        require(msg.sender == smaspContract, "Only SMASP can call this");
        pools[assetId].globalAssetsDeposit += amount;
        userPoolState[user][assetId][VOUCHER_REWARD_TYPE]
            .userPoolBalance += amount;
        emit AssetDepositedToPool(user, assetId, amount);
    }

    // @notice lets user stake their silent tokens to a pool
    function stakeSilentToPool(uint256 assetId, uint256 amount)
        external
        nonReentrant
        beforePeriodFinished(assetId, STAKING_REWARD_TYPE)
        updateReward(msg.sender, assetId, STAKING_REWARD_TYPE)
    {
        require(amount > 0, "Cannot stake 0");
        require(
            userPoolVoucherBalance[msg.sender][assetId] > 0,
            "Only Voucher owners can stake"
        );

        pools[assetId].globalSilentStaked += amount;
        userPoolState[msg.sender][assetId][STAKING_REWARD_TYPE]
            .userPoolBalance += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit SilentStakedInPool(msg.sender, assetId, amount);
    }

    // @notice lets user unstake their silent tokens from a pool
    function unstakeSilentFromPool(uint256 assetId, uint256 amount)
        external
        nonReentrant
        onlyValidPhase(assetId, STAKING_REWARD_TYPE)
        updateReward(msg.sender, assetId, STAKING_REWARD_TYPE)
    {
        require(amount > 0, "Cannot unstake 0");
        require(
            userPoolState[msg.sender][assetId][STAKING_REWARD_TYPE]
                .userPoolBalance >= amount,
            "Cannot unstake more than staked"
        );

        pools[assetId].globalSilentStaked -= amount;
        userPoolState[msg.sender][assetId][STAKING_REWARD_TYPE]
            .userPoolBalance -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit SilentUnstakedFromPool(msg.sender, assetId, amount);
    }

    // @notice lets a user claim accumulated rewards
    function claimRewards(uint256 assetId, bytes32 rewardType)
        external
        nonReentrant
        updateReward(msg.sender, assetId, rewardType)
    {
        uint256 reward = userPoolState[msg.sender][assetId][rewardType]
            .userPoolRewards;

        if (reward > 0) {
            userPoolState[msg.sender][assetId][rewardType].userPoolRewards = 0;
            if (rewardType == STAKING_REWARD_TYPE) {
                stakingToken.safeTransfer(msg.sender, reward);
                // ASSERT THAT PMC'S SILENT BALANCE IS MAINTAINED
            } else if (rewardType == VOUCHER_REWARD_TYPE) {
                userPoolVoucherBalance[msg.sender][assetId] += reward;
                pools[assetId].totalVouchersClaimed += reward;
            }
            emit RewardPaid(msg.sender, assetId, rewardType, reward);
        }
    }

    /* ========== PUBLIC VIEW FUNCTIONS ========== */

    // @notice computes the last reward claimable time for a user
    function lastTimeRewardApplicable(uint256 assetId, bytes32 rewardType)
        public
        view
        returns (uint256)
    {
        return
            Math.min(
                block.timestamp,
                rewardForPool[assetId][rewardType].periodFinish
            );
    }

    // @notice computes the running sum of R/globalAssetsDeposit or R/globalSilentStaked per second
    function rewardPerToken(uint256 assetId, bytes32 rewardType)
        public
        view
        returns (uint256)
    {
        uint256 globalPoolShare;
        if (rewardType == VOUCHER_REWARD_TYPE) {
            globalPoolShare = pools[assetId].globalAssetsDeposit;
        } else if (rewardType == STAKING_REWARD_TYPE) {
            globalPoolShare = pools[assetId].globalSilentStaked * pools[assetId].totalVouchersClaimed;
        }

        if (globalPoolShare == 0) {
            return rewardForPool[assetId][rewardType].rewardPerTokenStored;
        }

        Reward memory _rewardForPool = rewardForPool[assetId][rewardType];

        return
            _rewardForPool.rewardPerTokenStored +
            (((lastTimeRewardApplicable(assetId, rewardType) -
                _rewardForPool.lastUpdateTime) *
                _rewardForPool.rewardRate *
                1e36) / globalPoolShare);
    }


    // @notice computes the claimable rewards for a user
    function rewardsPending(
        address user,
        uint256 assetId,
        bytes32 rewardType
    ) public view returns (uint256) {
        UserPoolState memory _userPoolState = userPoolState[user][assetId][
            rewardType
        ];
        uint256 userEffectivePoolShare;
        if (rewardType == STAKING_REWARD_TYPE) {
            userEffectivePoolShare =
                _userPoolState.userPoolBalance *
                userPoolVoucherBalance[user][assetId];
        } else {
            userEffectivePoolShare = _userPoolState.userPoolBalance;
        }
        // k*(s-p[user])
        return
            ((userEffectivePoolShare *
                (rewardPerToken(assetId, rewardType) -
                    _userPoolState.userPoolRewardPerTokenPaid)) / 1e36) +
            _userPoolState.userPoolRewards;
    }

    /* ========== MODIFIERS ========== */

    // @notice updates the reward each time any user interacts with the SC [ deposit, stake, unstake, claim]
    modifier updateReward(
        address user,
        uint256 assetId,
        bytes32 rewardType
    ) {
        // Update the reward
        rewardForPool[assetId][rewardType]
            .rewardPerTokenStored = rewardPerToken(assetId, rewardType);
        rewardForPool[assetId][rewardType]
            .lastUpdateTime = lastTimeRewardApplicable(assetId, rewardType);

        if (user != address(0)) {
            // compute the pending rewards for the user store it in `userPoolRewards`
            userPoolState[user][assetId][rewardType]
                .userPoolRewards = rewardsPending(user, assetId, rewardType);
            
            userPoolState[user][assetId][rewardType]
                .userPoolRewardPerTokenPaid = rewardForPool[assetId][rewardType]
                .rewardPerTokenStored;
        }
        _;
    }

    modifier onlyValidPhase(uint256 assetId, bytes32 rewardType) {
        if (rewardType == VOUCHER_REWARD_TYPE && pools[assetId].phase != 1)
            revert OnlyCallableInPhaseOne();
        else if (rewardType == STAKING_REWARD_TYPE && pools[assetId].phase != 2)
            revert OnlyCallableInPhaseTwo();
        _;
    }

    modifier beforePeriodFinished(uint256 assetId, bytes32 rewardType) {
        if (block.timestamp > rewardForPool[assetId][rewardType].periodFinish)
            revert RewardPeriodFinished();
        _;
    }

    /* ========== GLOBAL FUNCTIONS ========== */

    // @notice fetches information of all assset reward pools ever created in the PMC
    function getDeployedPools() external view returns (Pool[] memory) {
        uint256 deployedPoolsLength = deployedPools.length;
        uint256 i;
        Pool[] memory pool = new Pool[](deployedPoolsLength);
        for (i = 0; i < deployedPoolsLength; i++) {
            pool[i] = pools[deployedPools[i]];
        }
        return pool;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // @notice lets the owner of the pool create a new Asset-Reward Pool of rewardType
    // @dev Extend the function for updating rewards
    function createAssetRewardPool(
        uint256 assetId,
        bytes32 rewardType,
        uint256 reward,
        uint256 rewardsDuration
    ) external onlyOwner {
        if (rewardType == VOUCHER_REWARD_TYPE) {
            require(pools[assetId].phase == 0, "Asset pool already created");
            pools[assetId].phase = 1;
            deployedPools.push(assetId);
        } else if (rewardType == STAKING_REWARD_TYPE) {
            if (
                block.timestamp <
                rewardForPool[assetId][VOUCHER_REWARD_TYPE].periodFinish
            ) revert("Phase One Ongoing");
            if (pools[assetId].phase != 1) revert OnlyCallableInPhaseOne();
            pools[assetId].phase = 2;
            // Transfer totalSilentRewards from the owner to the contract
            stakingToken.safeTransferFrom(msg.sender, address(this), reward);
        } else {
            revert();
        }

        // compute the rewardRate
        uint256 rewardRate = reward / rewardsDuration;

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

    function updateRewardRate(
        uint256 assetId,
        bytes32 rewardType,
        uint256 newRewardRate
    )
        external
        onlyOwner
        beforePeriodFinished(assetId, rewardType)
        updateReward(address(0), assetId, rewardType)
    {
        require(newRewardRate > 0, "Reward rate cannot be zero");
        Reward memory _rewardForPool = rewardForPool[assetId][rewardType];
        
        if (rewardType == STAKING_REWARD_TYPE) {
            if (newRewardRate > _rewardForPool.rewardRate) {
                uint256 remainingPeriod = _rewardForPool.periodFinish - block.timestamp;
                uint256 addedReward = newRewardRate * remainingPeriod;
                stakingToken.safeTransferFrom(msg.sender, address(this), addedReward);
            }
        }

        rewardForPool[assetId][rewardType].rewardRate = newRewardRate;
        emit RewardRateUpdated(assetId, rewardType, newRewardRate);
    }

    /* ========== EVENTS ========== */

    event RewardAdded(
        uint256 indexed assetId,
        bytes32 indexed rewardType,
        uint256 indexed reward
    );
    event AssetDepositedToPool(
        address indexed user,
        uint256 indexed assetId,
        uint256 indexed amount
    );
    event SilentStakedInPool(
        address indexed user,
        uint256 assetId,
        uint256 amount
    );
    event SilentUnstakedFromPool(
        address indexed user,
        uint256 assetId,
        uint256 amount
    );
    event RewardPaid(
        address indexed user,
        uint256 indexed assetId,
        bytes32 rewardType,
        uint256 indexed reward
    );

    event RewardRateUpdated(
        uint256 assetId,
        bytes32 rewardType,
        uint256 newRewardRate
    );
}
