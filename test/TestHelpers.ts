import { assert, expect } from "chai";
import {
  Signer,
  BigNumber,
  ContractTransaction,
  utils,
  Contract,
} from "ethers";
import {
  BorrowerOperations,
  TroveManagerTester,
  SortedTroves,
  StabilityPool,
  HintHelpers,
  PriceFeedTestnet,
} from "../typechain-types";
import { ethers } from "hardhat";

export const address = async (account: Signer) => {
  return await account.getAddress();
};

export const assertFalse = (content: boolean) => {
  expect(content).to.be.eq(false);
};

export const assertTrue = (content: boolean) => {
  expect(content).to.be.eq(true);
};

export const assertEqual = (a: any, b: any) => {
  expect(a).to.be.eq(b);
};

export const isAtMost = (a: BigNumber, b: BigNumber | number) => {
  expect(a).to.be.lte(b);
};

export const MoneyValues = {
  NEGATIVE_5E17: "-" + utils.parseUnits("500", "finney").toString(),
  NEGATIVE_1E18: "-" + utils.parseUnits("1", "ether").toString(),
  NEGATIVE_10E18: "-" + utils.parseUnits("10", "ether").toString(),
  NEGATIVE_50E18: "-" + utils.parseUnits("50", "ether").toString(),
  NEGATIVE_100E18: "-" + utils.parseUnits("100", "ether").toString(),
  NEGATIVE_101E18: "-" + utils.parseUnits("101", "ether").toString(),
  NEGATIVE_ETH: (amount: string) =>
    "-" + utils.parseUnits(amount, "ether").toString(),

  _ZEROBN: BigNumber.from("0"),
  _1E18BN: BigNumber.from("1000000000000000000"),
  _10E18Bn: BigNumber.from("10000000000000000000"),
  _100E18bn: BigNumber.from("100000000000000000000"),
  _100BN: BigNumber.from("100"),
  _110BN: BigNumber.from("110"),
  _150BN: BigNumber.from("150"),

  _MCR: BigNumber.from("1100000000000000000"),
  _ICR100: BigNumber.from("1000000000000000000"),
  _CCR: BigNumber.from("1500000000000000000"),
};

export const TimeValues = {
  SECONDS_IN_ONE_MINUTE: 60,
  SECONDS_IN_ONE_HOUR: 60 * 60,
  SECONDS_IN_ONE_DAY: 60 * 60 * 24,
  SECONDS_IN_ONE_WEEK: 60 * 60 * 24 * 7,
  SECONDS_IN_SIX_WEEKS: 60 * 60 * 24 * 7 * 6,
  SECONDS_IN_ONE_MONTH: 60 * 60 * 24 * 30,
  SECONDS_IN_ONE_YEAR: 60 * 60 * 24 * 365,
  MINUTES_IN_ONE_WEEK: 60 * 24 * 7,
  MINUTES_IN_ONE_MONTH: 60 * 24 * 30,
  MINUTES_IN_ONE_YEAR: 60 * 24 * 365,
};

export interface ContractType {
  hintHelpers: HintHelpers;
  borrowerOperations: BorrowerOperations;
  troveManager: TroveManagerTester;
  priceFeedTestnet: PriceFeedTestnet;
  sortedTroves: SortedTroves;
  stabilityPool: StabilityPool;
}

export class TestHelper {
  static ZERO_ADDRESS = "0x" + "0".repeat(40);
  static maxBytes32 = "0x" + "f".repeat(64);
  static _100pct = BigNumber.from("1000000000000000000");
  static latestRandomSeed = BigNumber.from(31337);

  static dec(
    val: number | string,
    scale: number | "ether" | "finney"
  ): BigNumber {
    let zerosCount: number;

    if (scale === "ether") {
      zerosCount = 18;
    } else if (scale === "finney") {
      zerosCount = 15;
    } else {
      zerosCount = scale;
    }

    const strVal: string = val.toString();
    const strZeros: string = "0".repeat(zerosCount);

    return BigNumber.from(strVal.concat(strZeros));
  }

  static squeezeAddr(address: string): string {
    const len = address.length;
    return address
      .slice(0, 6)
      .concat("...")
      .concat(address.slice(len - 4, len));
  }

  static getDifference(x: BigNumber, y: BigNumber): BigNumber {
    const difference = x.sub(y);
    return difference.abs();
  }

  static assertIsApproximatelyEqual(
    x: BigNumber,
    y: BigNumber,
    error = BigNumber.from("1000")
  ): void {
    expect(this.getDifference(x, y)).to.be.lte(error);
  }

  static zipToObject(array1: string[], array2: any[]): { [key: string]: any } {
    let obj: { [key: string]: any } = {};
    array1.forEach((element, idx) => (obj[element] = array2[idx]));
    return obj;
  }

  static getGasMetrics(gasCostList: number[]): {
    gasCostList: number[];
    minGas: number | undefined;
    maxGas: number | undefined;
    meanGas: number | undefined;
    medianGas: number | undefined;
  } {
    const minGas = Math.min(...gasCostList);
    const maxGas = Math.max(...gasCostList);

    let sum = 0;
    for (const gas of gasCostList) {
      sum += gas;
    }

    if (sum === 0) {
      return {
        gasCostList: gasCostList,
        minGas: undefined,
        maxGas: undefined,
        meanGas: undefined,
        medianGas: undefined,
      };
    }
    const meanGas = sum / gasCostList.length;

    // median is the middle element (for odd list size) or element adjacent-right of middle (for even list size)
    const sortedGasCostList = [...gasCostList].sort();
    const medianGas =
      sortedGasCostList[Math.floor(sortedGasCostList.length / 2)];

    return { gasCostList, minGas, maxGas, meanGas, medianGas };
  }

  static getGasMinMaxAvg(gasCostList: number[]): {
    minGas: number | undefined;
    maxGas: number | undefined;
    meanGas: number | undefined;
    medianGas: number | undefined;
  } {
    const metrics = TestHelper.getGasMetrics(gasCostList);

    const minGas = metrics.minGas;
    const maxGas = metrics.maxGas;
    const meanGas = metrics.meanGas;
    const medianGas = metrics.medianGas;

    return { minGas, maxGas, meanGas, medianGas };
  }

  static getEndOfAccount(account: string): string {
    const accountLast2bytes = account.slice(account.length - 4, account.length);
    return accountLast2bytes;
  }

  static randDecayFactor(min: number, max: number): BigNumber {
    const amount = Math.random() * (max - min) + min;
    const amountInWei = utils.parseUnits(amount.toFixed(18), "ether");
    return amountInWei;
  }

  static randAmountInWei(
    min: number | BigNumber,
    max: number | BigNumber
  ): BigNumber {
    const amount = Math.random() * (Number(max) - Number(min)) + Number(min);
    const amountInWei = utils.parseUnits(amount.toString(), "ether");
    return amountInWei;
  }

  static randAmountInGWei(min: number, max: number): BigNumber {
    const amount = Math.floor(Math.random() * (max - min) + min);
    const amountInWei = utils.parseUnits(amount.toString(), "gwei");
    return amountInWei;
  }

  static makeWei(num: string | number): BigNumber {
    return utils.parseUnits(num.toString(), "ether");
  }

  static appendData(
    results: { [key: string]: string | number },
    message: string,
    data: string[]
  ): void {
    data.push(message + "\n");
    for (const key in results) {
      data.push(key + "," + results[key] + "\n");
    }
  }

  static getRandICR(min: number, max: number): BigNumber {
    const ICR_Percent = Math.floor(Math.random() * (max - min) + min);

    // Convert ICR to a duint
    const ICR = utils.parseUnits((ICR_Percent * 10).toString(), "finney");
    return ICR;
  }

  static computeICR(
    coll: BigNumber,
    debt: BigNumber,
    price: BigNumber
  ): BigNumber {
    const ICR = debt.isZero()
      ? BigNumber.from(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        )
      : coll.mul(price).div(debt);

    return ICR;
  }

  static async ICRbetween100and110(
    account: string,
    troveManager: TroveManagerTester,
    price: BigNumber
  ): Promise<boolean> {
    const ICR = await troveManager.getCurrentICR(account, price);
    return ICR.gt(MoneyValues._ICR100) && ICR.lt(MoneyValues._MCR);
  }

  static async isUndercollateralized(
    account: string,
    troveManager: TroveManagerTester,
    price: BigNumber
  ): Promise<boolean> {
    const ICR = await troveManager.getCurrentICR(account, price);
    return ICR.lt(MoneyValues._MCR);
  }

  static toBN(num: number | string | BigNumber): BigNumber {
    return BigNumber.from(num);
  }

  static async gasUsed(tx: ContractTransaction): Promise<number> {
    const receipt = await ethers.provider.waitForTransaction(tx.hash);
    const gas = Number(receipt.gasUsed);
    return gas;
  }

  static applyLiquidationFee(ethAmount: BigNumber): BigNumber {
    return ethAmount.mul(this.toBN(this.dec(995, 15))).div(MoneyValues._1E18BN);
  }

  // --- Logging functions ---

  static logGasMetrics(
    gasResults: {
      minGas: number;
      maxGas: number;
      meanGas: number;
      medianGas: number;
    },
    message: string
  ): void {
    console.log(
      `\n ${message} \n
      min gas: ${gasResults.minGas} \n
      max gas: ${gasResults.maxGas} \n
      mean gas: ${gasResults.meanGas} \n
      median gas: ${gasResults.medianGas} \n`
    );
  }

  static logAllGasCosts(gasResults: { gasCostList: number[] }): void {
    console.log(`all gas costs: ${gasResults.gasCostList} \n`);
  }

  static logGas(gas: number, message: string): void {
    console.log(
      `\n ${message} \n
      gas used: ${gas} \n`
    );
  }

  static async logActiveAccounts(
    contracts: ContractType,
    n?: number | undefined | BigNumber
  ): Promise<void> {
    const count = await contracts.sortedTroves.getSize();
    const price = await contracts.priceFeedTestnet.getPrice();

    n = typeof n === "undefined" ? count : n;
    n = Number(n);

    let account = await contracts.sortedTroves.getLast();
    const head = await contracts.sortedTroves.getFirst();

    console.log(`Total active accounts: ${count}`);
    console.log(`First ${n} accounts, in ascending ICR order:`);

    let i = 0;
    while (i < n) {
      const squeezedAddr = this.squeezeAddr(account);
      const coll = (await contracts.troveManager.Troves(account))[1];
      const debt = (await contracts.troveManager.Troves(account))[0];
      const ICR = await contracts.troveManager.getCurrentICR(account, price);

      console.log(
        `Acct: ${squeezedAddr}  coll:${coll}  debt: ${debt}  ICR: ${ICR}`
      );

      if (account === head) {
        break;
      }

      account = await contracts.sortedTroves.getPrev(account);

      i++;
    }
  }

  static async logAccountsArray(
    accounts: string[],
    troveManager: TroveManagerTester,
    price: BigNumber,
    n?: number
  ): Promise<void> {
    const length = accounts.length;

    n = typeof n === "undefined" ? length : n;

    console.log(`Number of accounts in array: ${length}`);
    console.log(`First ${n} accounts of array:`);

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      const squeezedAddr = this.squeezeAddr(account);
      const coll = (await troveManager.Troves(account))[1];
      const debt = (await troveManager.Troves(account))[0];
      const ICR = await troveManager.getCurrentICR(account, price);

      console.log(
        `Acct: ${squeezedAddr}  coll:${coll}  debt: ${debt}  ICR: ${ICR}`
      );
    }
  }

  static logBN(label: string, x: BigNumber): void {
    const xString = x.toString().padStart(18, "0");
    // TODO: thousand separators
    const integerPart = xString.slice(0, xString.length - 18)
      ? xString.slice(0, xString.length - 18)
      : "0";
    console.log(`${label}:`, integerPart + "." + xString.slice(-18));
  }

  // --- TCR and Recovery Mode functions ---

  // These functions use the PriceFeedTestNet view price function getPrice() which is sufficient for testing.
  // the mainnet contract PriceFeed uses fetchPrice, which is non-view and writes to storage.

  // To checkRecoveryMode / getTCR from the Liquity mainnet contracts, pass a price value - this can be the lastGoodPrice
  // stored, or the current price, etc.

  static async checkRecoveryMode(contracts: ContractType): Promise<boolean> {
    const price = await contracts.priceFeedTestnet.getPrice();
    return contracts.troveManager.checkRecoveryMode(price);
  }

  static async getTCR(contracts: ContractType): Promise<BigNumber> {
    const price = await contracts.priceFeedTestnet.getPrice();
    return contracts.troveManager.getTCR(price);
  }

  // --- Gas compensation calculation functions ---

  // Given a composite debt, returns the actual debt  - i.e. subtracts the virtual debt.
  // Virtual debt = 50 ZKUSD.

  static async getActualDebtFromComposite(
    compositeDebt: BigNumber,
    contracts: ContractType
  ): Promise<BigNumber> {
    const issuedDebt = await contracts.troveManager.getActualDebtFromComposite(
      compositeDebt
    );
    return issuedDebt;
  }

  // Adds the gas compensation (50 ZKUSD)
  static async getCompositeDebt(
    contracts: ContractType,
    debt: BigNumber
  ): Promise<BigNumber> {
    const compositeDebt = contracts.borrowerOperations.getCompositeDebt(debt);
    return compositeDebt;
  }

  static async getTroveEntireColl(
    contracts: ContractType,
    trove: string
  ): Promise<BigNumber> {
    return (await contracts.troveManager.getEntireDebtAndColl(trove))[1];
  }

  static async getTroveEntireDebt(
    contracts: ContractType,
    trove: string
  ): Promise<BigNumber> {
    return (await contracts.troveManager.getEntireDebtAndColl(trove))[0];
  }

  static async getTroveStake(
    contracts: ContractType,
    trove: string
  ): Promise<BigNumber> {
    return contracts.troveManager.getTroveStake(trove);
  }

  /*
   * given the requested ZKUSD amount in openTrove, returns the total debt
   * So, it adds the gas compensation and the borrowing fee
   */
  static async getOpenTroveTotalDebt(
    contracts: ContractType,
    zkusdAmount: BigNumber
  ): Promise<BigNumber> {
    const fee = await contracts.troveManager.getBorrowingFee(zkusdAmount);
    const compositeDebt = await this.getCompositeDebt(contracts, zkusdAmount);
    return compositeDebt.add(fee);
  }

  /*
   * given the desired total debt, returns the ZKUSD amount that needs to be requested in openTrove
   * So, it subtracts the gas compensation and then the borrowing fee
   */
  static async getOpenTroveZKUSDAmount(
    contracts: ContractType,
    totalDebt: BigNumber
  ): Promise<BigNumber> {
    const actualDebt = await this.getActualDebtFromComposite(
      totalDebt,
      contracts
    );
    return this.getNetBorrowingAmount(contracts, actualDebt);
  }

  // Subtracts the borrowing fee
  static async getNetBorrowingAmount(
    contracts: ContractType,
    debtWithFee: BigNumber
  ): Promise<BigNumber> {
    const borrowingRate =
      await contracts.troveManager.getBorrowingRateWithDecay();
    return debtWithFee
      .mul(MoneyValues._1E18BN)
      .div(MoneyValues._1E18BN.add(borrowingRate));
  }

  // Adds the borrowing fee
  static async getAmountWithBorrowingFee(
    contracts: ContractType,
    rasUSDAmount: BigNumber
  ): Promise<BigNumber> {
    const fee = await contracts.troveManager.getBorrowingFee(rasUSDAmount);
    return rasUSDAmount.add(fee);
  }

  // Adds the redemption fee
  static getEmittedRedemptionValues(
    redemptionTx: any
  ): [BigNumber, BigNumber, BigNumber, BigNumber] {
    for (let i = 0; i < redemptionTx.logs.length; i++) {
      if (redemptionTx.logs[i].event === "Redemption") {
        const ZKUSDAmount = redemptionTx.logs[i].args[0];
        const totalZKUSDRedeemed = redemptionTx.logs[i].args[1];
        const totalETHDrawn = redemptionTx.logs[i].args[2];
        const ETHFee = redemptionTx.logs[i].args[3];

        return [ZKUSDAmount, totalZKUSDRedeemed, totalETHDrawn, ETHFee];
      }
    }
    throw "The transaction logs do not contain a redemption event";
  }

  static async getEmittedLiquidationValues(
    contracts: ContractType,
    liquidationTx: ContractTransaction
  ): Promise<[BigNumber, BigNumber, BigNumber, BigNumber]> {
    const receipt = await liquidationTx.wait();
    const liquidationLogs = receipt.logs
      .map((log) => {
        try {
          return contracts.troveManager.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(
        (parsedLog) => parsedLog !== null && parsedLog.name === "Liquidation"
      );
    if (liquidationLogs.length > 0) {
      // @ts-ignore
      const liquidatedDebt = liquidationLogs[0].args._liquidatedDebt;
      // @ts-ignore
      const liquidatedColl = liquidationLogs[0].args._liquidatedColl;
      // @ts-ignore
      const collGasComp = liquidationLogs[0].args._collGasCompensation;
      // @ts-ignore

      const zkusdGasComp = liquidationLogs[0].args._ZKUSDGasCompensation;

      return [liquidatedDebt, liquidatedColl, collGasComp, zkusdGasComp];
    }
    throw "The transaction logs do not contain a liquidation event";
  }

  static getLiquidationEventArg(liquidationTx: any, arg: string): BigNumber {
    for (let i = 0; i < liquidationTx.logs.length; i++) {
      if (liquidationTx.logs[i].event === "Liquidation") {
        return liquidationTx.logs[i].args[arg];
      }
    }

    throw "The transaction logs do not contain a liquidation event";
  }

  static getZKUSDFeeFromZKUSDBorrowingEvent(tx: any): string {
    for (let i = 0; i < tx.logs.length; i++) {
      if (tx.logs[i].event === "ZKUSDBorrowingFeePaid") {
        return tx.logs[i].args[1].toString();
      }
    }
    throw "The transaction logs do not contain an ZKUSDBorrowingFeePaid event";
  }

  static getEventArgByIndex(
    tx: any,
    eventName: string,
    argIndex: number
  ): BigNumber {
    for (let i = 0; i < tx.logs.length; i++) {
      if (tx.logs[i].event === eventName) {
        return tx.logs[i].args[argIndex];
      }
    }
    throw `The transaction logs do not contain event ${eventName}`;
  }

  static getEventArgByName(
    tx: any,
    eventName: string,
    argName: string
  ): BigNumber {
    for (let i = 0; i < tx.logs.length; i++) {
      if (tx.logs[i].event === eventName) {
        const keys = Object.keys(tx.logs[i].args);
        for (let j = 0; j < keys.length; j++) {
          if (keys[j] === argName) {
            return tx.logs[i].args[keys[j]];
          }
        }
      }
    }

    throw `The transaction logs do not contain event ${eventName} and arg ${argName}`;
  }

  static getAllEventsByName(tx: any, eventName: string): Array<any> {
    const events = [];
    for (let i = 0; i < tx.logs.length; i++) {
      if (tx.logs[i].event === eventName) {
        events.push(tx.logs[i]);
      }
    }
    return events;
  }

  static getDebtAndCollFromTroveUpdatedEvents(
    troveUpdatedEvents: Array<any>,
    address: string
  ): [BigNumber, BigNumber] {
    const event = troveUpdatedEvents.filter(
      (event) => event.args[0] === address
    )[0];
    return [event.args[1], event.args[2]];
  }

  static async getBorrowerOpsListHint(
    contracts: ContractType,
    newColl: BigNumber,
    newDebt: BigNumber
  ): Promise<{ upperHint: string; lowerHint: string }> {
    const newNICR = await contracts.hintHelpers.computeNominalCR(
      newColl,
      newDebt
    );
    const { hintAddress: approxfullListHint, latestRandomSeed } =
      await contracts.hintHelpers.getApproxHint(
        newNICR,
        5,
        this.latestRandomSeed
      );
    this.latestRandomSeed = latestRandomSeed;

    const { 0: upperHint, 1: lowerHint } =
      await contracts.sortedTroves.findInsertPosition(
        newNICR,
        approxfullListHint,
        approxfullListHint
      );
    return { upperHint, lowerHint };
  }

  static async getEntireCollAndDebt(
    contracts: ContractType,
    account: string
  ): Promise<{ entireColl: BigNumber; entireDebt: BigNumber }> {
    // console.log(`account: ${account}`)
    const rawColl = (await contracts.troveManager.Troves(account))[1];
    const rawDebt = (await contracts.troveManager.Troves(account))[0];
    const pendingETHReward = await contracts.troveManager.getPendingETHReward(
      account
    );
    const pendingZKUSDDebtReward =
      await contracts.troveManager.getPendingZKUSDDebtReward(account);
    const entireColl = rawColl.add(pendingETHReward);
    const entireDebt = rawDebt.add(pendingZKUSDDebtReward);

    return { entireColl, entireDebt };
  }

  static async getCollAndDebtFromAddColl(
    contracts: ContractType,
    account: string,
    amount: BigNumber
  ): Promise<{ newColl: BigNumber; newDebt: BigNumber }> {
    const { entireColl, entireDebt } = await this.getEntireCollAndDebt(
      contracts,
      account
    );
    const newColl = entireColl.add(BigNumber.from(amount));
    const newDebt = entireDebt;
    return { newColl, newDebt };
  }

  static async getCollAndDebtFromWithdrawColl(
    contracts: ContractType,
    account: string,
    amount: BigNumber
  ): Promise<{ newColl: BigNumber; newDebt: BigNumber }> {
    const { entireColl, entireDebt } = await this.getEntireCollAndDebt(
      contracts,
      account
    );
    // console.log(`entireColl  ${entireColl}`)
    // console.log(`entireDebt  ${entireDebt}`)

    const newColl = entireColl.sub(BigNumber.from(amount));
    const newDebt = entireDebt;
    return { newColl, newDebt };
  }

  static async getCollAndDebtFromWithdrawZKUSD(
    contracts: ContractType,
    account: string,
    amount: BigNumber
  ): Promise<{ newColl: BigNumber; newDebt: BigNumber }> {
    const fee = await contracts.troveManager.getBorrowingFee(amount);
    const { entireColl, entireDebt } = await this.getEntireCollAndDebt(
      contracts,
      account
    );

    const newColl = entireColl;
    const newDebt = entireDebt.add(BigNumber.from(amount)).add(fee);

    return { newColl, newDebt };
  }

  static async getCollAndDebtFromRepayZKUSD(
    contracts: ContractType,
    account: string,
    amount: BigNumber
  ): Promise<{ newColl: BigNumber; newDebt: BigNumber }> {
    const { entireColl, entireDebt } = await this.getEntireCollAndDebt(
      contracts,
      account
    );

    const newColl = entireColl;
    const newDebt = entireDebt.sub(BigNumber.from(amount));

    return { newColl, newDebt };
  }

  static async getCollAndDebtFromAdjustment(
    contracts: ContractType,
    account: string,
    ETHChange: BigNumber,
    ZKUSDChange: BigNumber
  ): Promise<{ newColl: BigNumber; newDebt: BigNumber }> {
    const { entireColl, entireDebt } = await this.getEntireCollAndDebt(
      contracts,
      account
    );

    const fee = ZKUSDChange.gt(BigNumber.from("0"))
      ? await contracts.troveManager.getBorrowingFee(ZKUSDChange)
      : BigNumber.from("0");
    const newColl = entireColl.add(ETHChange);
    const newDebt = entireDebt.add(ZKUSDChange).add(fee);

    return { newColl, newDebt };
  }

  // --- BorrowerOperations gas functions ---
  static async openTrove_allAccounts(
    accounts: string[],
    contracts: ContractType,
    ETHAmount: BigNumber,
    ZKUSDAmount: BigNumber
  ): Promise<any> {
    const gasCostList = [];
    const totalDebt = await this.getOpenTroveTotalDebt(contracts, ZKUSDAmount);

    for (const account of accounts) {
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        ETHAmount,
        totalDebt
      );

      const tx = await contracts.borrowerOperations.openTrove(
        this._100pct,
        ZKUSDAmount,
        upperHint,
        lowerHint,
        { from: account, value: ETHAmount }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async openTrove_allAccounts_randomETH(
    minETH: BigNumber,
    maxETH: BigNumber,
    accounts: string[],
    contracts: ContractType,
    ZKUSDAmount: BigNumber
  ): Promise<any> {
    const gasCostList = [];
    const totalDebt = await this.getOpenTroveTotalDebt(contracts, ZKUSDAmount);

    for (const account of accounts) {
      const randCollAmount = this.randAmountInWei(minETH, maxETH);
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        randCollAmount,
        totalDebt
      );

      const tx = await contracts.borrowerOperations.openTrove(
        this._100pct,
        ZKUSDAmount,
        upperHint,
        lowerHint,
        { from: account, value: randCollAmount }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async openTrove_allAccounts_randomETH_ProportionalZKUSD(
    minETH: BigNumber,
    maxETH: BigNumber,
    accounts: string[],
    contracts: ContractType,
    proportion: BigNumber
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      const randCollAmount = this.randAmountInWei(minETH, maxETH);
      const proportionalZKUSD = proportion.mul(randCollAmount);
      const totalDebt = await this.getOpenTroveTotalDebt(
        contracts,
        proportionalZKUSD
      );

      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        randCollAmount,
        totalDebt
      );

      const tx = await contracts.borrowerOperations.openTrove(
        this._100pct,
        proportionalZKUSD,
        upperHint,
        lowerHint,
        { from: account, value: randCollAmount }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }
  static async openTrove_allAccounts_randomETH_randomZKUSD(
    minETH: BigNumber,
    maxETH: BigNumber,
    accounts: string[],
    contracts: ContractType,
    minZKUSDProportion: BigNumber,
    maxZKUSDProportion: BigNumber,
    logging = false
  ): Promise<any> {
    const gasCostList = [];
    const _1e18 = BigNumber.from("1000000000000000000");

    for (const account of accounts) {
      const randCollAmount = this.randAmountInWei(minETH, maxETH);
      const randZKUSDProportion = this.randAmountInWei(
        minZKUSDProportion,
        maxZKUSDProportion
      );
      const proportionalZKUSD = randZKUSDProportion.mul(
        randCollAmount.div(_1e18)
      );
      const totalDebt = await this.getOpenTroveTotalDebt(
        contracts,
        proportionalZKUSD
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        randCollAmount,
        totalDebt
      );
      const tx = await contracts.borrowerOperations.openTrove(
        this._100pct,
        proportionalZKUSD,
        upperHint,
        lowerHint,
        { from: account, value: randCollAmount }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async closeTrove_allAccounts(
    accounts: string[],
    contracts: ContractType
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      const tx = await contracts.borrowerOperations.closeTrove({
        from: account,
      });
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async openTrove_allAccounts_decreasingZKUSDAmounts(
    accounts: string[],
    contracts: ContractType,
    ETHAmount: BigNumber,
    maxZKUSDAmount: BigNumber
  ): Promise<any> {
    const gasCostList = [];

    let i = 0;
    for (const account of accounts) {
      const ZKUSDAmount = maxZKUSDAmount.sub(i).toString();
      const ZKUSDAmountWei = BigNumber.from(ZKUSDAmount).mul(
        BigNumber.from("10").pow(18)
      );
      const totalDebt = await this.getOpenTroveTotalDebt(
        contracts,
        ZKUSDAmountWei
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        ETHAmount,
        totalDebt
      );

      const tx = await contracts.borrowerOperations.openTrove(
        this._100pct,
        ZKUSDAmountWei,
        upperHint,
        lowerHint,
        { from: account, value: ETHAmount }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
      i += 1;
    }
    return this.getGasMetrics(gasCostList);
  }

  static async openTrove(
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
    if (!maxFeePercentage) maxFeePercentage = this._100pct;
    if (!extraZKUSDAmount) extraZKUSDAmount = BigNumber.from(0);
    else if (typeof extraZKUSDAmount == "string")
      extraZKUSDAmount = BigNumber.from(extraZKUSDAmount);
    if (!upperHint) upperHint = this.ZERO_ADDRESS;
    if (!lowerHint) lowerHint = this.ZERO_ADDRESS;

    const MIN_DEBT = (
      await this.getNetBorrowingAmount(
        contracts,
        await contracts.borrowerOperations.MIN_NET_DEBT()
      )
    ).add(BigNumber.from(1)); // add 1 to avoid rounding issues
    const zkusdAmount = MIN_DEBT.add(extraZKUSDAmount);

    if (!ICR && !extraParams.value)
      ICR = BigNumber.from(this.dec(15, 17)); // 150%
    else if (typeof ICR == "string") ICR = BigNumber.from(ICR);

    const totalDebt = await this.getOpenTroveTotalDebt(contracts, zkusdAmount);
    const netDebt = await this.getActualDebtFromComposite(totalDebt, contracts);

    if (ICR) {
      const price = await contracts.priceFeedTestnet.getPrice();
      extraParams.value = ICR.mul(totalDebt).div(price);
    }

    console.log("totalDebt: ", totalDebt.toString())
    console.log("netDebt: ", netDebt.toString())
    console.log("value: ", extraParams.value.toString())
    const tx = await contracts.borrowerOperations
      .connect(account)
      .openTrove(
        maxFeePercentage,
        zkusdAmount,
        upperHint,
        lowerHint,
        extraParams
      );

    return {
      zkusdAmount,
      netDebt,
      totalDebt,
      ICR,
      collateral: extraParams.value,
      tx,
    };
  }

  static async withdrawZKUSD(
    contracts: ContractType,
    account: Signer,
    {
      maxFeePercentage,
      zkusdAmount,
      ICR,
      upperHint,
      lowerHint,
      extraParams,
    }: {
      maxFeePercentage?: BigNumber;
      zkusdAmount?: BigNumber;
      ICR?: BigNumber;
      upperHint?: string;
      lowerHint?: string;
      extraParams: any;
    }
  ): Promise<any> {
    if (!maxFeePercentage) maxFeePercentage = this._100pct;
    if (!upperHint) upperHint = this.ZERO_ADDRESS;
    if (!lowerHint) lowerHint = this.ZERO_ADDRESS;

    let increasedTotalDebt;
    if (ICR) {
      const { debt, coll } = await contracts.troveManager.getEntireDebtAndColl(
        extraParams.from
      );
      const price = await contracts.priceFeedTestnet.getPrice();
      const targetDebt = coll.mul(price).div(ICR);
      increasedTotalDebt = targetDebt.sub(debt);
      zkusdAmount = await this.getNetBorrowingAmount(
        contracts,
        increasedTotalDebt
      );
    } else {
      zkusdAmount =
        zkusdAmount === undefined ? BigNumber.from("0") : zkusdAmount;
      increasedTotalDebt = await this.getAmountWithBorrowingFee(
        contracts,
        zkusdAmount
      );
    }

    await contracts.borrowerOperations
      .connect(account)
      .withdrawZKUSD(
        maxFeePercentage,
        zkusdAmount,
        upperHint,
        lowerHint,
        extraParams
      );

    return {
      zkusdAmount,
      increasedTotalDebt,
    };
  }

  static async adjustTrove_allAccounts(
    accounts: string[],
    contracts: ContractType,
    ETHAmount: BigNumber,
    ZKUSDAmount: BigNumber
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      let ETHChangeBN = BigNumber.from(ETHAmount);
      let ZKUSDChangeBN = BigNumber.from(ZKUSDAmount);

      const { newColl, newDebt } = await this.getCollAndDebtFromAdjustment(
        contracts,
        account,
        ETHChangeBN,
        ZKUSDChangeBN
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const zero = BigNumber.from("0");

      let isDebtIncrease = ZKUSDChangeBN.gt(zero);
      ZKUSDChangeBN = ZKUSDChangeBN.abs();

      // Add ETH to trove
      if (ETHChangeBN.gt(zero)) {
        const tx = await contracts.borrowerOperations.adjustTrove(
          this._100pct,
          0,
          ZKUSDChangeBN,
          isDebtIncrease,
          upperHint,
          lowerHint,
          { from: account, value: ETHChangeBN }
        );
        const gas = await this.gasUsed(tx);
        gasCostList.push(gas);
        // Withdraw ETH from trove
      } else if (ETHChangeBN.lt(zero)) {
        ETHChangeBN = ETHChangeBN.mul(-1);
        const tx = await contracts.borrowerOperations.adjustTrove(
          this._100pct,
          ETHChangeBN,
          ZKUSDChangeBN,
          isDebtIncrease,
          upperHint,
          lowerHint,
          { from: account }
        );
        const gas = await this.gasUsed(tx);
        gasCostList.push(gas);
      }
    }
    return this.getGasMetrics(gasCostList);
  }

  static async adjustTrove_allAccounts_randomAmount(
    accounts: string[],
    contracts: ContractType,
    ETHMin: BigNumber,
    ETHMax: BigNumber,
    ZKUSDMin: BigNumber,
    ZKUSDMax: BigNumber
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      let ETHChangeBN = BigNumber.from(this.randAmountInWei(ETHMin, ETHMax));
      let ZKUSDChangeBN = BigNumber.from(
        this.randAmountInWei(ZKUSDMin, ZKUSDMax)
      );

      const { newColl, newDebt } = await this.getCollAndDebtFromAdjustment(
        contracts,
        account,
        ETHChangeBN,
        ZKUSDChangeBN
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const zero = BigNumber.from("0");

      let isDebtIncrease = ZKUSDChangeBN.gt(zero);
      ZKUSDChangeBN = ZKUSDChangeBN.abs();

      // Add ETH to trove
      if (ETHChangeBN.gt(zero)) {
        const tx = await contracts.borrowerOperations.adjustTrove(
          this._100pct,
          0,
          ZKUSDChangeBN,
          isDebtIncrease,
          upperHint,
          lowerHint,
          { from: account, value: ETHChangeBN }
        );
        // Withdraw ETH from trove
        const gas = await this.gasUsed(tx);
        gasCostList.push(gas);
      } else if (ETHChangeBN.lt(zero)) {
        ETHChangeBN = ETHChangeBN.mul(-1);
        const tx = await contracts.borrowerOperations.adjustTrove(
          this._100pct,
          ETHChangeBN,
          ZKUSDChangeBN,
          isDebtIncrease,
          upperHint,
          lowerHint,
          { from: account }
        );
        const gas = await this.gasUsed(tx);
        gasCostList.push(gas);
      }
    }
    return this.getGasMetrics(gasCostList);
  }

  static async addColl_allAccounts(
    accounts: string[],
    contracts: ContractType,
    amount: BigNumber
  ): Promise<any> {
    const gasCostList = [];
    for (const account of accounts) {
      const { newColl, newDebt } = await this.getCollAndDebtFromAddColl(
        contracts,
        account,
        amount
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const tx = await contracts.borrowerOperations.addColl(
        upperHint,
        lowerHint,
        { from: account, value: amount }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async addColl_allAccounts_randomAmount(
    min: BigNumber,
    max: BigNumber,
    accounts: string[],
    contracts: ContractType
  ): Promise<any> {
    const gasCostList = [];
    for (const account of accounts) {
      const randCollAmount = this.randAmountInWei(min, max);

      const { newColl, newDebt } = await this.getCollAndDebtFromAddColl(
        contracts,
        account,
        randCollAmount
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const tx = await contracts.borrowerOperations.addColl(
        upperHint,
        lowerHint,
        { from: account, value: randCollAmount }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async withdrawColl_allAccounts(
    accounts: string[],
    contracts: ContractType,
    amount: BigNumber
  ): Promise<any> {
    const gasCostList = [];
    for (const account of accounts) {
      const { newColl, newDebt } = await this.getCollAndDebtFromWithdrawColl(
        contracts,
        account,
        amount
      );
      // console.log(`newColl: ${newColl} `)
      // console.log(`newDebt: ${newDebt} `)
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const tx = await contracts.borrowerOperations.withdrawColl(
        amount,
        upperHint,
        lowerHint,
        { from: account }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async withdrawColl_allAccounts_randomAmount(
    min: BigNumber,
    max: BigNumber,
    accounts: string[],
    contracts: ContractType
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      const randCollAmount = this.randAmountInWei(min, max);

      const { newColl, newDebt } = await this.getCollAndDebtFromWithdrawColl(
        contracts,
        account,
        randCollAmount
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const tx = await contracts.borrowerOperations.withdrawColl(
        randCollAmount,
        upperHint,
        lowerHint,
        { from: account }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
      // console.log("gasCostlist length is " + gasCostList.length)
    }
    return this.getGasMetrics(gasCostList);
  }

  static async withdrawZKUSD_allAccounts(
    accounts: string[],
    contracts: ContractType,
    amount: BigNumber
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      const { newColl, newDebt } = await this.getCollAndDebtFromWithdrawZKUSD(
        contracts,
        account,
        amount
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const tx = await contracts.borrowerOperations.withdrawZKUSD(
        this._100pct,
        amount,
        upperHint,
        lowerHint,
        { from: account }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async withdrawZKUSD_allAccounts_randomAmount(
    min: BigNumber,
    max: BigNumber,
    accounts: string[],
    contracts: ContractType
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      const randZKUSDAmount = this.randAmountInWei(min, max);

      const { newColl, newDebt } = await this.getCollAndDebtFromWithdrawZKUSD(
        contracts,
        account,
        randZKUSDAmount
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const tx = await contracts.borrowerOperations.withdrawZKUSD(
        this._100pct,
        randZKUSDAmount,
        upperHint,
        lowerHint,
        { from: account }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async repayZKUSD_allAccounts(
    accounts: string[],
    contracts: ContractType,
    amount: BigNumber
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      const { newColl, newDebt } = await this.getCollAndDebtFromRepayZKUSD(
        contracts,
        account,
        amount
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const tx = await contracts.borrowerOperations.repayZKUSD(
        amount,
        upperHint,
        lowerHint,
        { from: account }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async repayZKUSD_allAccounts_randomAmount(
    min: BigNumber,
    max: BigNumber,
    accounts: string[],
    contracts: ContractType
  ): Promise<any> {
    const gasCostList = [];

    for (const account of accounts) {
      const randZKUSDAmount = this.randAmountInWei(min, max);

      const { newColl, newDebt } = await this.getCollAndDebtFromRepayZKUSD(
        contracts,
        account,
        randZKUSDAmount
      );
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        newDebt
      );

      const tx = await contracts.borrowerOperations.repayZKUSD(
        randZKUSDAmount,
        upperHint,
        lowerHint,
        { from: account }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async getCurrentICR_allAccounts(
    accounts: string[],
    contracts: ContractType,
    functionCaller: any
  ): Promise<any> {
    const gasCostList = [];
    const price = await contracts.priceFeedTestnet.getPrice();

    for (const account of accounts) {
      const tx = await functionCaller.troveManager_getCurrentICR(
        account,
        price
      );
      // const gas = await this.gasUsed(tx) - 21000;
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  // --- Redemption functions ---
  static async redeemCollateral(
    redeemer: Signer,
    contracts: ContractType,
    ZKUSDAmount: BigNumber,
    gasPrice: BigNumber = BigNumber.from("0"),
    maxFee: BigNumber = this._100pct
  ): Promise<any> {
    const price = await contracts.priceFeedTestnet.getPrice();
    const tx = await this.performRedemptionTx(
      redeemer,
      price,
      contracts,
      ZKUSDAmount,
      maxFee,
      gasPrice
    );
    const gas = await this.gasUsed(tx);
    return gas;
  }

  static async redeemCollateralAndGetTxObject(
    redeemer: Signer,
    contracts: ContractType,
    ZKUSDAmount: BigNumber,
    gasPrice: BigNumber = BigNumber.from("0"),
    maxFee: BigNumber = this._100pct
  ): Promise<any> {
    if (gasPrice.lte(BigNumber.from("0"))) {
      gasPrice = await ethers.provider.getGasPrice();
    }
    const price = await contracts.priceFeedTestnet.getPrice();
    const tx = await this.performRedemptionTx(
      redeemer,
      price,
      contracts,
      ZKUSDAmount,
      maxFee,
      gasPrice
    );
    return tx;
  }

  static async redeemCollateral_allAccounts_randomAmount(
    min: BigNumber,
    max: BigNumber,
    accounts: Signer[],
    contracts: ContractType
  ): Promise<any> {
    const gasCostList = [];
    const price = await contracts.priceFeedTestnet.getPrice();

    for (const redeemer of accounts) {
      const randZKUSDAmount = this.randAmountInWei(min, max);

      const tx = await this.performRedemptionTx(
        redeemer,
        price,
        contracts,
        randZKUSDAmount
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async performRedemptionTx(
    redeemer: Signer,
    price: BigNumber,
    contracts: ContractType,
    ZKUSDAmount: BigNumber,
    maxFee: BigNumber = BigNumber.from("0"),
    gasPrice_toUse: BigNumber = BigNumber.from("0")
  ): Promise<any> {
    const redemptionhint = await contracts.hintHelpers.getRedemptionHints(
      ZKUSDAmount,
      price,
      gasPrice_toUse
    );

    const firstRedemptionHint = redemptionhint[0];
    const partialRedemptionNewICR = redemptionhint[1];

    const { hintAddress: approxPartialRedemptionHint, latestRandomSeed } =
      await contracts.hintHelpers.getApproxHint(
        partialRedemptionNewICR,
        50,
        this.latestRandomSeed
      );
    this.latestRandomSeed = latestRandomSeed;

    const exactPartialRedemptionHint =
      await contracts.sortedTroves.findInsertPosition(
        partialRedemptionNewICR,
        approxPartialRedemptionHint,
        approxPartialRedemptionHint
      );

    const tx = await contracts.troveManager
      .connect(redeemer)
      .redeemCollateral(
        ZKUSDAmount,
        firstRedemptionHint,
        exactPartialRedemptionHint[0],
        exactPartialRedemptionHint[1],
        partialRedemptionNewICR,
        0,
        maxFee,
        { from: await redeemer.getAddress(), gasPrice: gasPrice_toUse }
      );

    return tx;
  }

  // --- Composite functions ---
  static async makeTrovesIncreasingICR(
    accounts: string[],
    contracts: ContractType
  ): Promise<void> {
    let amountFinney = 2000;

    for (const account of accounts) {
      const coll = utils.parseUnits(amountFinney.toString(), "finney");

      await contracts.borrowerOperations.openTrove(
        this._100pct,
        "200000000000000000000",
        account,
        account,
        { from: account, value: coll }
      );

      amountFinney += 10;
    }
  }

  // --- StabilityPool gas functions ---
  static async provideToSP_allAccounts(
    accounts: string[],
    stabilityPool: StabilityPool,
    amount: BigNumber
  ): Promise<any> {
    const gasCostList = [];
    for (const account of accounts) {
      const tx = await stabilityPool.provideToSP(amount, { from: account });
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async provideToSP_allAccounts_randomAmount(
    min: BigNumber,
    max: BigNumber,
    accounts: string[],
    stabilityPool: StabilityPool
  ): Promise<any> {
    const gasCostList = [];
    for (const account of accounts) {
      const randomZKUSDAmount = this.randAmountInWei(min, max);
      const tx = await stabilityPool.provideToSP(randomZKUSDAmount, {
        from: account,
      });
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async withdrawFromSP_allAccounts(
    accounts: string[],
    stabilityPool: StabilityPool,
    amount: BigNumber
  ): Promise<any> {
    const gasCostList = [];
    for (const account of accounts) {
      const tx = await stabilityPool.withdrawFromSP(amount, { from: account });
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async withdrawFromSP_allAccounts_randomAmount(
    min: BigNumber,
    max: BigNumber,
    accounts: string[],
    stabilityPool: StabilityPool
  ): Promise<any> {
    const gasCostList = [];
    for (const account of accounts) {
      const randomZKUSDAmount = this.randAmountInWei(min, max);
      const tx = await stabilityPool.withdrawFromSP(randomZKUSDAmount, {
        from: account,
      });
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static async withdrawETHGainToTrove_allAccounts(
    accounts: string[],
    contracts: ContractType
  ): Promise<any> {
    const gasCostList = [];
    for (const account of accounts) {
      let { entireColl, entireDebt } = await this.getEntireCollAndDebt(
        contracts,
        account
      );
      console.log(`entireColl: ${entireColl}`);
      console.log(`entireDebt: ${entireDebt}`);
      const ETHGain = await contracts.stabilityPool.getDepositorETHGain(
        account
      );
      const newColl = entireColl.add(ETHGain);
      const { upperHint, lowerHint } = await this.getBorrowerOpsListHint(
        contracts,
        newColl,
        entireDebt
      );

      const tx = await contracts.stabilityPool.withdrawETHGainToTrove(
        upperHint,
        lowerHint,
        { from: account }
      );
      const gas = await this.gasUsed(tx);
      gasCostList.push(gas);
    }
    return this.getGasMetrics(gasCostList);
  }

  static hexToParam(hexValue: string): string {
    return ("0".repeat(64) + hexValue.slice(2)).slice(-64);
  }

  static formatParam(param: string | number | boolean): string {
    let formattedParam = param;
    if (
      typeof param == "number" ||
      typeof param == "object" ||
      (typeof param == "string" && new RegExp("[0-9]*").test(param))
    ) {
      formattedParam = utils.hexlify(param);
    } else if (typeof param == "boolean") {
      formattedParam = param ? "0x01" : "0x00";
    } else if (param.slice(0, 2) != "0x") {
      formattedParam = utils.hexlify(utils.toUtf8Bytes(param));
    }

    return this.hexToParam(formattedParam.toString());
  }

  static getTransactionData(
    signatureString: string,
    params: Array<any>
  ): string {
    return (
      utils.sha256(utils.toUtf8Bytes(signatureString)).slice(0, 10) +
      params.reduce((acc, p) => acc + this.formatParam(p), "")
    );
  }

  static async fastForwardTime(seconds: number): Promise<void> {
    try {
      // 调用 evm_increaseTime
      await ethers.provider.send("evm_increaseTime", [seconds]);

      // 调用 evm_mine
      await ethers.provider.send("evm_mine", []);
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  static async assertRevert(transaction: ContractTransaction) {
    try {
      const receipt = await ethers.provider.getTransactionReceipt(
        transaction.hash
      );
      // console.log("tx succeeded")
      assert.isFalse(receipt.status); // when this assert fails, the expected revert didn't occur, i.e. the tx succeeded
    } catch (err) {
      if (err instanceof Error) {
        assert.include(err.message, "revert");
      }
    }
  }
}
