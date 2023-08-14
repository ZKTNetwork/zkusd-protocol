import {BigNumber, Signer} from "ethers";
import {ethers} from "hardhat";
import {
    BorrowerOperations,
    HintHelpers,
    PriceFeedTestnet,
    SortedTroves,
    StabilityPool,
    TroveManager
} from "../typechain-types";

const _1E18BN = BigNumber.from("1000000000000000000")

export interface ContractType {
    hintHelpers: HintHelpers;
    borrowerOperations: BorrowerOperations;
    troveManager: TroveManager;
    priceFeedTestnet: PriceFeedTestnet;
    sortedTroves: SortedTroves;
    stabilityPool: StabilityPool;
}

async function getNetBorrowingAmount(
    contracts: ContractType,
    debtWithFee: BigNumber
): Promise<BigNumber> {
    const borrowingRate =
        // @ts-ignore
        await contracts.troveManager.getBorrowingRateWithDecay();
    return debtWithFee
        .mul(_1E18BN)
        .div(_1E18BN.add(borrowingRate));
}

async function getCompositeDebt(
    contracts: ContractType,
    debt: BigNumber
): Promise<BigNumber> {
    // @ts-ignore
    return contracts.borrowerOperations.getCompositeDebt(debt);
}

async function getOpenTroveTotalDebt(
    contracts: ContractType,
    zkusdAmount: BigNumber
): Promise<BigNumber> {
    // @ts-ignore
    const fee = await contracts.troveManager.getBorrowingFee(zkusdAmount);
    const compositeDebt = await getCompositeDebt(contracts, zkusdAmount);
    return compositeDebt.add(fee);
}

async function getActualDebtFromComposite(
    compositeDebt: BigNumber,
    contracts: ContractType
): Promise<BigNumber> {
    // @ts-ignore
    const ZKUSD_GAS_COMPENSATION = await contracts.troveManager.ZKUSD_GAS_COMPENSATION();
    return compositeDebt.sub(ZKUSD_GAS_COMPENSATION)
}

async function openTrove(
    contracts: ContractType,
    account: Signer,
    {
        maxFeePercentage,
        extraZKUSDAmount,
        upperHint,
        lowerHint,
        ICR,
        extraParams,
    }: {
        maxFeePercentage?: BigNumber;
        extraZKUSDAmount?: BigNumber;
        upperHint?: string;
        lowerHint?: string;
        ICR?: BigNumber;
        extraParams: any;
    }
): Promise<any> {
    if (!maxFeePercentage) maxFeePercentage = _1E18BN
    if (!extraZKUSDAmount) extraZKUSDAmount = ethers.utils.parseEther('0')
    if (!upperHint) upperHint = ethers.constants.AddressZero
    if (!lowerHint) lowerHint = ethers.constants.AddressZero

    const MIN_DEBT = (
        // @ts-ignore
        await getNetBorrowingAmount(contracts, await contracts.borrowerOperations.MIN_NET_DEBT())
    ).add(ethers.BigNumber.from('1')) // add 1 to avoid rounding issues
    const zkusdAmount = MIN_DEBT.add(extraZKUSDAmount)

    if (!ICR && !extraParams.value) ICR = ethers.utils.parseEther("1.5") // 150%

    const totalDebt = await getOpenTroveTotalDebt(contracts, zkusdAmount)
    const netDebt = await getActualDebtFromComposite(totalDebt, contracts)

    if (ICR) {
        // @ts-ignore
        const price = await contracts.priceFeedTestnet.getPrice()
        extraParams.value = ICR.mul(totalDebt).div(price)
    }

    // @ts-ignore
    const tx = await contracts.borrowerOperations.connect(account).openTrove(maxFeePercentage, zkusdAmount, upperHint, lowerHint, extraParams)
    console.log(`openTrove tx: ${tx.hash}`)
    await tx.wait()

    return {
        zkusdAmount,
        netDebt,
        totalDebt,
        ICR,
        collateral: extraParams.value,
        tx
    }
}

function print(params: {
    zkusdAmount: BigNumber;
    netDebt: BigNumber;
    totalDebt: BigNumber;
    ICR: BigNumber;
    collateral: BigNumber;
}) {
    console.log(`zkusdAmount: ${params.zkusdAmount}`)
    console.log(`netDebt: ${params.netDebt}`)
    console.log(`totalDebt: ${params.totalDebt}`)
    console.log(`ICR: ${params.ICR}`)
    console.log(`collateral: ${params.collateral}`)
}


async function main() {
    const signers = await ethers.getSigners()
    const deployer = signers[0];
    const alice = signers[1];
    const bob = signers[2];
    const bo = (await ethers.getContract("BorrowerOperations")) as BorrowerOperations;
    const tm = (await ethers.getContract("TroveManager")) as TroveManager;
    const oracle = (await ethers.getContract("PriceFeedTestnet")) as PriceFeedTestnet;
    const hintHelpers = (await ethers.getContract("HintHelpers")) as HintHelpers;

    const contracts = {
        troveManager: tm,
        stabilityPool: (await ethers.getContract("StabilityPool")) as StabilityPool,
        borrowerOperations: bo,
        priceFeedTestnet: oracle,
        hintHelpers: hintHelpers,
        sortedTroves: (await ethers.getContract("SortedTroves")) as SortedTroves
    };

    const ret0 = await openTrove(contracts, deployer, {
        ICR: ethers.utils.parseEther('20'),
        extraParams: {from: deployer.address},
    })
    console.log("RET0: ")
    print(ret0)

    const ret1 = await openTrove(contracts, alice, {
        ICR: ethers.utils.parseEther('3'),
        extraZKUSDAmount: ethers.utils.parseEther('400'),
        extraParams: {from: alice.address},
    });
    console.log("RET1:")
    print(ret1)
}

main()

