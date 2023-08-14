// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/ICommunityIssuance.sol";
import "../interfaces/IZKToken.sol";
import "../dependencies/CheckContract.sol";
import "../dependencies/FullMath.sol";

contract CommunityIssuance is ICommunityIssuance, CheckContract, Ownable {
    using SafeMath for uint256;

    // --- Data ---

    string public constant NAME = "CommunityIssuance";

    uint256 public constant SECONDS_IN_ONE_MINUTE = 60;

    uint256 public constant DECIMAL_PRECISION = 1e18;

    /* The issuance factor F determines the curvature of the issuance curve.
     *
     * Minutes in one year: 60*24*365 = 525600
     *
     * For 50% of remaining tokens issued each year, with minutes as time units, we have:
     *
     * F ** 525600 = 0.5
     *
     * Re-arranging:
     *
     * 525600 * ln(F) = ln(0.5)
     * F = 0.5 ** (1/525600)
     * F = 0.999998681227695000
     */
    uint256 public constant ISSUANCE_FACTOR = 999998681227695000;

    /*
     * The community ZKT supply cap is the starting balance of the Community Issuance contract.
     * It should be minted to this contract by ZKToken, when the token is deployed.json.
     *
     * Set to 32M (slightly less than 1/3) of total ZKT supply.
     */
    uint256 public constant ZKTSupplyCap = 32e24; // 32 million

    IZKToken public zkToken;

    address public stabilityPoolAddress;

    uint256 public totalZKTIssued;
    uint256 public immutable deploymentTime;

    constructor() {
        deploymentTime = block.timestamp;
    }

    function setAddresses(
        address _zkTokenAddress,
        address _stabilityPoolAddress
    ) external override onlyOwner {
        checkContract(_zkTokenAddress);
        checkContract(_stabilityPoolAddress);

        zkToken = IZKToken(_zkTokenAddress);
        stabilityPoolAddress = _stabilityPoolAddress;

        // When ZKToken deployed.json, it should have transferred CommunityIssuance's ZKT entitlement
        uint256 ZKTBalance = zkToken.balanceOf(address(this));
        assert(ZKTBalance >= ZKTSupplyCap);

        emit ZKTokenAddressSet(_zkTokenAddress);
        emit StabilityPoolAddressSet(_stabilityPoolAddress);

        //renounceOwnership();
    }

    function issueZKT() external override returns (uint256) {
        _requireCallerIsStabilityPool();

        uint256 latestTotalZKTIssued = ZKTSupplyCap
            .mul(_getCumulativeIssuanceFraction())
            .div(DECIMAL_PRECISION);
        uint256 issuance = latestTotalZKTIssued.sub(totalZKTIssued);

        totalZKTIssued = latestTotalZKTIssued;
        emit TotalZKTIssuedUpdated(latestTotalZKTIssued);

        return issuance;
    }

    /* Gets 1-f^t    where: f < 1

    f: issuance factor that determines the shape of the curve
    t:  time passed since last ZKT issuance event  */
    function _getCumulativeIssuanceFraction() internal view returns (uint256) {
        // Get the time passed since deployment
        uint256 timePassedInMinutes = block.timestamp.sub(deploymentTime).div(
            SECONDS_IN_ONE_MINUTE
        );

        // f^t
        uint256 power = FullMath._decPow(ISSUANCE_FACTOR, timePassedInMinutes);

        //  (1 - f^t)
        uint256 cumulativeIssuanceFraction = (
            uint256(DECIMAL_PRECISION).sub(power)
        );
        assert(cumulativeIssuanceFraction <= DECIMAL_PRECISION); // must be in range [0,1]

        return cumulativeIssuanceFraction;
    }

    function sendZKT(address _account, uint256 _ZKTamount) external override {
        _requireCallerIsStabilityPool();

        zkToken.transfer(_account, _ZKTamount);
    }

    // --- 'require' functions ---

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "CommunityIssuance: caller is not SP"
        );
    }
}
