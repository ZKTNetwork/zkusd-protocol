import { EvmPriceServiceConnection} from "@pythnetwork/pyth-evm-js"

const func = async function (endpoint: string) {
    const conn = new EvmPriceServiceConnection(endpoint, {logger: console});
    const priceIds = [
        // You can find the ids of prices at https://pyth.network/developers/price-feed-ids#pyth-evm-testnet
        "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b", // BTC/USD price id in testnet
        "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6", // NEON/USD price id in testnet
    ];
    // In order to use Pyth prices in your protocol you need to submit the price update data to Pyth contract in your target
    // chain. `getPriceFeedsUpdateData` creates the update data which can be submitted to your contract. Then your contract should
    // call the Pyth Contract with this data.
    const priceUpdateData1 = await conn.getPriceFeedsUpdateData(priceIds);
    console.log(priceUpdateData1)

    const priceUpdateData2 = await conn.getPriceFeedsUpdateData(priceIds);
    console.log(priceUpdateData2)
}

func("https://xc-testnet.pyth.network")