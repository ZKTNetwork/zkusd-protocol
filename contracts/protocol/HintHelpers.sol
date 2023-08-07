// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/ITroveManager.sol";
import "../interfaces/ISortedTroves.sol";
import "../dependencies/FullMath.sol";
import "../dependencies/ZKTProtocolBase.sol";
import "../dependencies/CheckContract.sol";

contract HintHelpers is ZKTProtocolBase, CheckContract, Ownable {
    using SafeMath for uint256;

    string public constant NAME = "HintHelpers";

    ISortedTroves public sortedTroves;
    ITroveManager public troveManager;

    // --- Events ---

    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event TroveManagerAddressChanged(address _troveManagerAddress);

    // --- Dependency setters ---

    function setAddresses(
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_sortedTrovesAddress);
        checkContract(_troveManagerAddress);

        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        troveManager = ITroveManager(_troveManagerAddress);

        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        //renounceOwnership();
    }

    // --- Functions ---

    /* getRedemptionHints() - Helper function for finding the right hints to pass to redeemCollateral().
     *
     * It simulates a redemption of `_ZKUSDamount` to figure out where the redemption sequence will start and what state the final Trove
     * of the sequence will end up in.
     *
     * Returns three hints:
     *  - `firstRedemptionHint` is the address of the first Trove with ICR >= MCR (i.e. the first Trove that will be redeemed).
     *  - `partialRedemptionHintNICR` is the final nominal ICR of the last Trove of the sequence after being hit by partial redemption,
     *     or zero in case of no partial redemption.
     *  - `truncatedZKUSDamount` is the maximum amount that can be redeemed out of the the provided `_ZKUSDamount`. This can be lower than
     *    `_ZKUSDamount` when redeeming the full amount would leave the last Trove of the redemption sequence with less net debt than the
     *    minimum allowed value (i.e. MIN_NET_DEBT).
     *
     * The number of Troves to consider for redemption can be capped by passing a non-zero value as `_maxIterations`, while passing zero
     * will leave it uncapped.
     */

    function getRedemptionHints(
        uint256 _ZKUSDamount,
        uint256 _price,
        uint256 _maxIterations
    )
        external
        view
        returns (
            address firstRedemptionHint,
            uint256 partialRedemptionHintNICR,
            uint256 truncatedZKUSDamount
        )
    {
        ISortedTroves sortedTrovesCached = sortedTroves;

        uint256 remainingZKUSD = _ZKUSDamount;
        address currentTroveuser = sortedTrovesCached.getLast();

        while (
            currentTroveuser != address(0) &&
            troveManager.getCurrentICR(currentTroveuser, _price) < MCR
        ) {
            currentTroveuser = sortedTrovesCached.getPrev(currentTroveuser);
        }

        firstRedemptionHint = currentTroveuser;

        if (_maxIterations == 0) {
            _maxIterations = type(uint256).max;
        }

        while (
            currentTroveuser != address(0) &&
            remainingZKUSD > 0 &&
            _maxIterations-- > 0
        ) {
            uint256 netZKUSDDebt = _getNetDebt(
                troveManager.getTroveDebt(currentTroveuser)
            ).add(troveManager.getPendingZKUSDDebtReward(currentTroveuser));

            if (netZKUSDDebt > remainingZKUSD) {
                if (netZKUSDDebt > MIN_NET_DEBT) {
                    uint256 maxRedeemableZKUSD = Math.min(
                        remainingZKUSD,
                        netZKUSDDebt.sub(MIN_NET_DEBT)
                    );

                    uint256 NEON = troveManager
                        .getTroveColl(currentTroveuser)
                        .add(
                            troveManager.getPendingNEONReward(currentTroveuser)
                        );

                    uint256 newColl = NEON.sub(
                        maxRedeemableZKUSD.mul(DECIMAL_PRECISION).div(_price)
                    );
                    uint256 newDebt = netZKUSDDebt.sub(maxRedeemableZKUSD);

                    uint256 compositeDebt = _getCompositeDebt(newDebt);
                    partialRedemptionHintNICR = FullMath._computeNominalCR(
                        newColl,
                        compositeDebt
                    );

                    remainingZKUSD = remainingZKUSD.sub(maxRedeemableZKUSD);
                }
                break;
            } else {
                remainingZKUSD = remainingZKUSD.sub(netZKUSDDebt);
            }

            currentTroveuser = sortedTrovesCached.getPrev(currentTroveuser);
        }

        truncatedZKUSDamount = _ZKUSDamount.sub(remainingZKUSD);
    }

    /* getApproxHint() - return address of a Trove that is, on average, (length / numTrials) positions away in the
sortedTroves list from the correct insert position of the Trove to be inserted.

Note: The output address is worst-case O(n) positions away from the correct insert position, however, the function
is probabilistic. Input can be tuned to guarantee results to a high degree of confidence, e.g:

Submitting numTrials = k * sqrt(length), with k = 15 makes it very, very likely that the ouput address will
be <= sqrt(length) positions away from the correct insert position.
*/
    function getApproxHint(
        uint256 _CR,
        uint256 _numTrials,
        uint256 _inputRandomSeed
    )
        external
        view
        returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)
    {
        uint256 arrayLength = troveManager.getTroveOwnersCount();

        if (arrayLength == 0) {
            return (address(0), 0, _inputRandomSeed);
        }

        hintAddress = sortedTroves.getLast();
        diff = FullMath._getAbsoluteDifference(
            _CR,
            troveManager.getNominalICR(hintAddress)
        );
        latestRandomSeed = _inputRandomSeed;

        uint256 i = 1;

        while (i < _numTrials) {
            latestRandomSeed = uint256(
                keccak256(abi.encodePacked(latestRandomSeed))
            );

            uint256 arrayIndex = latestRandomSeed % arrayLength;
            address currentAddress = troveManager.getTroveFromTroveOwnersArray(
                arrayIndex
            );
            uint256 currentNICR = troveManager.getNominalICR(currentAddress);

            // check if abs(current - CR) > abs(closest - CR), and update closest if current is closer
            uint256 currentDiff = FullMath._getAbsoluteDifference(
                currentNICR,
                _CR
            );

            if (currentDiff < diff) {
                diff = currentDiff;
                hintAddress = currentAddress;
            }
            i++;
        }
    }

    function computeNominalCR(
        uint256 _coll,
        uint256 _debt
    ) external pure returns (uint256) {
        return FullMath._computeNominalCR(_coll, _debt);
    }

    function computeCR(
        uint256 _coll,
        uint256 _debt,
        uint256 _price
    ) external pure returns (uint256) {
        return FullMath._computeCR(_coll, _debt, _price);
    }
}
