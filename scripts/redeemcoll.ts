import { Signer, BigNumber } from "ethers";
import {ethers, network} from "hardhat";
import {BorrowerOperations, PriceFeedTestnet, TroveManager} from "../typechain-types";

const _1E18BN = BigNumber.from("1000000000000000000")
const GAS_PRICE = 10000000

async function main() {
    const signers = await ethers.getSigners()
    const account0 = signers[0];
    const bo = (await ethers.getContract("BorrowerOperations")) as BorrowerOperations;
    const tm = (await ethers.getContract("TroveManager")) as TroveManager;
    const oracle = (await ethers.getContract("PriceFeedTestnet")) as PriceFeedTestnet;
    const sortedTroves = await ethers.getContract("SortedTroves")
    const hintHelpers = await ethers.getContract("HintHelpers")
    const redemptionAmount = ethers.utils.parseEther("200");

    const price = await oracle.getPrice();
    const { firstRedemptionHint, partialRedemptionHintNICR } =
        await hintHelpers.getRedemptionHints(ethers.utils.parseEther('400'), price, 0);

    const { 0: upperPartialRedemptionHint, 1: lowerPartialRedemptionHint } =
        await sortedTroves.findInsertPosition(
            partialRedemptionHintNICR,
            account0.address,
            account0.address
        );

    let redemptionTx = await tm.redeemCollateral(
        ethers.utils.parseEther('400'),
        firstRedemptionHint,
        upperPartialRedemptionHint,
        lowerPartialRedemptionHint,
        partialRedemptionHintNICR,
        0,
        _1E18BN.toString(),
        { from: account0.address }
    );
    console.log(`txHash: ${redemptionTx.hash}`);
}

main()

