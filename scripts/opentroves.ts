import { Signer, BigNumber } from "ethers";
import {ethers, network} from "hardhat";
import {BorrowerOperations, PriceFeedTestnet, TroveManager} from "../typechain-types";
import {ContractType} from "../test/TestHelpers";
import {max} from "hardhat/internal/util/bigint";

const _1E18BN = BigNumber.from("1000000000000000000")


async function main() {
    const signers = await ethers.getSigners()
    const account0 = signers[0];
    const bo = (await ethers.getContract("BorrowerOperations")) as BorrowerOperations;
    const tm = (await ethers.getContract("TroveManager")) as TroveManager;
    const oracle = (await ethers.getContract("PriceFeedTestnet")) as PriceFeedTestnet;

    const debtWithFee = await bo.MIN_NET_DEBT();
    const icr = ethers.utils.parseEther("0.5");
    const borrowingRate = await tm.getBorrowingRateWithDecay();
    const netBorrowingAmount = debtWithFee.mul(_1E18BN).div(_1E18BN.add(borrowingRate)).add(BigNumber.from(1));
    const zkusdAmount = netBorrowingAmount.add(BigNumber.from(0))
    const totalDebt = (await tm.getBorrowingFee(zkusdAmount)).add(await bo.getCompositeDebt(zkusdAmount))
    const netDebt = totalDebt.sub(await tm.ZKUSD_GAS_COMPENSATION())
    const value = icr.mul(totalDebt).div(await oracle.getPrice())

    console.log(ethers.utils.formatEther(value))

    const maxFeePercentage = ethers.BigNumber.from("1000000000000000000")
    const tx = await bo.connect(account0).openTrove(
        maxFeePercentage,
        zkusdAmount,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        {value: value}
    );
    await tx.wait();
    console.log(`txHash: ${tx.hash}`);
}

main()

