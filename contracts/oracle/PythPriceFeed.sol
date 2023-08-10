// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/IPriceFeed.sol";

/*
 * PriceFeed for mainnet deployment, to be connected to Pyth-netowrk's live `NATIVE`:USD aggregator reference
 *
 * The PriceFeed uses Pyth-network as primary oracle.
 */
contract PythPriceFeed is IPriceFeed, CheckContract, Ownable {
    using SafeMath for uint256;

    event UpdatePythPriceByData(
        bytes[] priceUpdateData,
        PythStructs.Price price
    );

    string public constant NAME = "PythNetworkPriceFeed";
    uint256 public constant PYTH_MAX_AGE = 20;

    // Pyth network
    IPyth public pythAggregator;
    bytes32 public priceFeedId;

    uint256 public lastGoodPrice;
    PythStructs.Price internal _lastGoodRetrievedPrice;

    // Use to convert a price answer to an 18-digit precision uint
    uint256 public constant TARGET_DIGITS = 18;

    // --- Dependency setters ---
    function setAddresses(
        bytes32 _priceFeedId,
        address _priceAggregatorAddress
    ) external onlyOwner {
        checkContract(_priceAggregatorAddress);

        priceFeedId = _priceFeedId;
        pythAggregator = IPyth(_priceAggregatorAddress);

        (
            uint256 price,
            ,
            PythStructs.Price memory retrievedPrice
        ) = _getPythPrice();
        lastGoodPrice = price;
        _lastGoodRetrievedPrice = retrievedPrice;
    }

    // --- Functions ---

    /*
     * fetchPrice():
     * Returns the latest price obtained from the Oracle. Called by zkt functions that require a current price.
     *
     * Also callable by anyone externally.
     *
     * Non-view function - it stores the last good price seen by zkt.
     *
     * Uses a main oracle (PythNetwork)
     * it uses the last good price seen.
     *
     */
    function fetchPrice() external override returns (uint256) {
        (
            uint256 price,
            uint256 publishTime,
            PythStructs.Price memory retrievedPrice
        ) = _getPythPrice();
        if (block.timestamp - publishTime > PYTH_MAX_AGE) {
            uint256 _lastGoodRetrievedPriceValue = _calculatePrice(
                _lastGoodRetrievedPrice
            );
            if (
                block.timestamp - _lastGoodRetrievedPrice.publishTime <=
                PYTH_MAX_AGE
            ) {
                return _lastGoodRetrievedPriceValue;
            } else if (publishTime > _lastGoodRetrievedPrice.publishTime) {
                return price;
            } else {
                return _lastGoodRetrievedPriceValue;
            }
        } else {
            lastGoodPrice = price;
            _lastGoodRetrievedPrice = retrievedPrice;
        }
        return price;
    }

    function updatePythPrice(
        bytes[] calldata priceUpdateData
    ) external payable {
        // Updates price for all submitted price feeds
        uint256 fee = pythAggregator.getUpdateFee(priceUpdateData);
        require(msg.value >= fee, "Insufficient fee");
        pythAggregator.updatePriceFeeds{value: fee}(priceUpdateData);
        _lastGoodRetrievedPrice = pythAggregator.getPrice(priceFeedId);
        lastGoodPrice = _calculatePrice(_lastGoodRetrievedPrice);
        emit UpdatePythPriceByData(priceUpdateData, _lastGoodRetrievedPrice);

        if (msg.value - fee > 0) {
            // Need to refund msg.sender. Try to return unused value, or revert if failed
            // solhint-disable-next-line  avoid-low-level-calls
            (bool success, ) = payable(msg.sender).call{value: msg.value - fee}(
                ""
            );
            require(success, "Failed to refund msg.sender");
        }
    }

    function _getPythPrice()
        internal
        view
        returns (uint256, uint256, PythStructs.Price memory)
    {
        // It will revert if the price is older than maxAge
        PythStructs.Price memory retrievedPrice = pythAggregator.getPriceUnsafe(
            priceFeedId
        );

        // Convert price to 18 decimals
        uint256 price = _calculatePrice(retrievedPrice);
        uint256 publishTime = retrievedPrice.publishTime;

        return (price, publishTime, retrievedPrice);
    }

    function _calculatePrice(
        PythStructs.Price memory retrievedPrice
    ) internal pure returns (uint256 price) {
        /*
        retrievedPrice.price fixed-point representation base
        retrievedPrice.expo fixed-point representation exponent (to go from base to decimal)
        retrievedPrice.conf fixed-point representation of confidence
        i.e.
        .price = 12276250
        .expo = -5
        price = 12276250 * 10^(-5) =  122.76250
        to go to 18 decimals => rebasedPrice = 12276250 * 10^(18-5) = 122762500000000000000
        */

        // Adjust exponent (using base as 18 decimals)
        uint256 baseConvertion = 10 **
            uint256(int256(TARGET_DIGITS) + retrievedPrice.expo);

        price = uint256(retrievedPrice.price * int256(baseConvertion));
    }
}
