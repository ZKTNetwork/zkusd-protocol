// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "witnet-solidity-bridge/contracts/interfaces/IWitnetPriceRouter.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/IPriceFeed.sol";

contract WitnetPriceFeed is IPriceFeed, Ownable, CheckContract {
    using SafeMath for uint256;

    string public constant NAME = "WitnetPriceFeed";

    IWitnetPriceRouter public priceRouter;
    bytes4 public priceFeedId;

    // Use to convert a price answer to an 18-digit precision uint256
    uint256 public constant TARGET_DIGITS = 18;
    uint256 public constant WITNET_DIGITS = 6;

    /// last good price fetch by troveManage
    uint256 public lastGoodPrice;
    WitnetResponse public latestGoodResponse;

    struct WitnetResponse {
        int256 lastPrice;
        uint256 lastTimestamp;
        uint256 lastUpdateStatus;
    }

    // --- Dependency setters ---
    function setAddresses(
        bytes4 _priceFeedId,
        address _priceRouter
    ) external onlyOwner {
        checkContract(_priceRouter);

        priceFeedId = _priceFeedId;
        priceRouter = IWitnetPriceRouter(_priceRouter);
        WitnetResponse memory witnetResponse = _getCurrentResponse();
        _storeLocalPrice(witnetResponse);
    }

    function fetchPrice() external override returns (uint256) {
        WitnetResponse memory witnetResponse = _getCurrentResponse();
        if (latestGoodResponse.lastTimestamp > witnetResponse.lastTimestamp) {
            return
                _scalePriceByDigits(
                    uint256(latestGoodResponse.lastPrice),
                    WITNET_DIGITS
                );
        } else {
            _storeLocalPrice(witnetResponse);
            return lastGoodPrice;
        }
    }

    function _getCurrentResponse()
        internal
        view
        returns (WitnetResponse memory witnetResponse)
    {
        //try to get latest price data:
        try priceRouter.valueFor(bytes32(priceFeedId)) returns (
            int256 lastPrice,
            uint256 lastTimestamp,
            uint256 lastUpdateStatus
        ) {
            // If call to Witnet succeeds, return the response and success = true
            witnetResponse.lastPrice = lastPrice;
            witnetResponse.lastTimestamp = lastTimestamp;
            witnetResponse.lastUpdateStatus = lastUpdateStatus;
            return witnetResponse;
        } catch {
            // If call to Witnet aggregator reverts, return a zero response with success = false
            return witnetResponse;
        }
    }

    function _storeLocalPrice(WitnetResponse memory witnetResponse) internal {
        uint256 scaledPrice = _scalePriceByDigits(
            uint256(witnetResponse.lastPrice),
            WITNET_DIGITS
        );
        lastGoodPrice = scaledPrice;
        latestGoodResponse = witnetResponse;
        emit LastGoodPriceUpdated(lastGoodPrice);
    }

    function _scalePriceByDigits(
        uint256 _price,
        uint256 _digits
    ) internal pure returns (uint256 price) {
        /*
         * Convert the price returned by the Witnet oracle to an 18-digit decimal for use by Liquity.
         * At date of Rime launch, Witnet uses an 6-digit price, but we also handle the possibility of
         * future changes.
         *
         */
        if (_digits >= TARGET_DIGITS) {
            // Scale the returned price value down to Liquity's target precision
            price = _price.div(10 ** (_digits - TARGET_DIGITS));
        } else if (_digits < TARGET_DIGITS) {
            // Scale the returned price value up to Liquity's target precision
            price = _price.mul(10 ** (TARGET_DIGITS - _digits));
        }
        return price;
    }
}
