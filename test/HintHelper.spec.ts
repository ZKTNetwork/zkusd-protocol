import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { TestHelper as th, ContractType, address } from "./TestHelpers";
import { DeployHelpers, deployFunction } from "./DeployHelpers";
import { ZKUSDToken } from "../typechain-types";

const dec = th.dec;
const toBN = th.toBN;

describe("HintHelper", async () => {
  let zkusdToken: ZKUSDToken;
  let contracts: ContractType;
  let latestRandomSeed = BigNumber.from("31337");
  const dh: DeployHelpers = new DeployHelpers();
  const numAccounts = 10;

  const openTrove = async (account: Signer, index: number) => {
    const amountFinney = 2000 + index * 10;
    const accountAddress = await address(account);
    const coll = ethers.utils.parseUnits(amountFinney.toString(), "finney");
    await contracts.borrowerOperations
      .connect(account)
      .openTrove(th._100pct, 0, accountAddress, accountAddress, {
        from: accountAddress,
        value: coll,
      });
  };

  const withdrawZKUSDfromTrove = async (account: Signer) => {
    const accountAddress = await address(account);
    await contracts.borrowerOperations
      .connect(account)
      .withdrawZKUSD(
        th._100pct,
        "100000000000000000000",
        accountAddress,
        accountAddress
      );
  };

  const makeTrovesInParallel = async (accounts: Signer[], n: number) => {
    const activeAccounts = accounts.slice(0, n);
    // console.log(`number of accounts used is: ${activeAccounts.length}`)
    // console.time("makeTrovesInParallel")
    const openTrovepromises = activeAccounts.map((account, index) =>
      openTrove(account, index)
    );
    await Promise.all(openTrovepromises);
    const withdrawZKUSDpromises = activeAccounts.map((account) =>
      withdrawZKUSDfromTrove(account)
    );
    await Promise.all(withdrawZKUSDpromises);
    // console.timeEnd("makeTrovesInParallel")
  };

  // Sequentially add coll and withdraw ZKUSD, 1 account at a time
  const makeTrovesInSequence = async (accounts: Signer[], n: number) => {
    const activeAccounts = accounts.slice(0, n);
    // console.log(`number of accounts used is: ${activeAccounts.length}`)

    let ICR = 200;

    // console.time('makeTrovesInSequence')
    for (const account of activeAccounts) {
      const ICR_BN = toBN(ICR.toString().concat("0".repeat(16)));
      await th.openTrove(contracts, account, {
        extraZKUSDAmount: toBN(dec(10000, 18)),
        ICR: ICR_BN,
        extraParams: { from: address(account) },
      });

      ICR += 1;
    }
    // console.timeEnd('makeTrovesInSequence')
  };

  before(async () => {
    await dh.runBeforeInitialize();
    await dh.runDeployCore();
    contracts = {
      troveManager: dh.testEnv.troveManager,
      stabilityPool: dh.testEnv.stabilityPool,
      borrowerOperations: dh.testEnv.borrowerOperations,
      priceFeedTestnet: dh.testEnv.priceFeed,
      hintHelpers: dh.testEnv.hintHelpers,
      sortedTroves: dh.testEnv.sortedTroves,
    };
    zkusdToken = dh.testEnv.zkusdToken;
    await contracts.priceFeedTestnet.setPrice(dec(100, 18));
    await makeTrovesInSequence(dh.testEnv.users, numAccounts);
  });

  it("setup: makes accounts with nominal ICRs increasing by 1% consecutively", async () => {
    // check first 10 accounts
    const ICR_0 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[0])
    );
    const ICR_1 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[1])
    );
    const ICR_2 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[2])
    );
    const ICR_3 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[3])
    );
    const ICR_4 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[4])
    );
    const ICR_5 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[5])
    );
    const ICR_6 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[6])
    );
    const ICR_7 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[7])
    );
    const ICR_8 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[8])
    );
    const ICR_9 = await contracts.troveManager.getNominalICR(
      address(dh.testEnv.users[9])
    );

    assert.isTrue(ICR_0.eq(toBN(dec(200, 16))));
    assert.isTrue(ICR_1.eq(toBN(dec(201, 16))));
    assert.isTrue(ICR_2.eq(toBN(dec(202, 16))));
    assert.isTrue(ICR_3.eq(toBN(dec(203, 16))));
    assert.isTrue(ICR_4.eq(toBN(dec(204, 16))));
    assert.isTrue(ICR_5.eq(toBN(dec(205, 16))));
    assert.isTrue(ICR_6.eq(toBN(dec(206, 16))));
    assert.isTrue(ICR_7.eq(toBN(dec(207, 16))));
    assert.isTrue(ICR_8.eq(toBN(dec(208, 16))));
    assert.isTrue(ICR_9.eq(toBN(dec(209, 16))));
  });

  it("getApproxHint(): returns the address of a Trove within sqrt(length) positions of the correct insert position", async () => {
    const sqrtLength = Math.ceil(Math.sqrt(numAccounts));

    /* As per the setup, the ICRs of Troves are monotonic and seperated by 1% intervals. Therefore, the difference in ICR between
        the given CR and the ICR of the hint address equals the number of positions between the hint address and the correct insert position
        for a Trove with the given CR. */

    // CR = 250%
    const CR_250 = "2500000000000000000";
    const CRPercent_250 =
      Number(ethers.utils.formatUnits(CR_250, "ether")) * 100;

    let hintAddress;

    // const hintAddress_250 = await functionCaller.troveManager_getApproxHint(CR_250, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } =
      await contracts.hintHelpers.getApproxHint(
        CR_250,
        sqrtLength * 10,
        latestRandomSeed
      ));
    const ICR_hintAddress_250 = await contracts.troveManager.getNominalICR(
      hintAddress
    );
    const ICRPercent_hintAddress_250 =
      Number(ethers.utils.formatUnits(ICR_hintAddress_250, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    const ICR_Difference_250 = ICRPercent_hintAddress_250 - CRPercent_250;
    assert.isBelow(ICR_Difference_250, sqrtLength);

    // CR = 287%
    const CR_287 = "2870000000000000000";
    const CRPercent_287 = Number(ethers.utils.formatUnits(CR_287, "wei")) * 100;

    // const hintAddress_287 = await functionCaller.troveManager_getApproxHint(CR_287, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } =
      await contracts.hintHelpers.getApproxHint(
        CR_287,
        sqrtLength * 10,
        latestRandomSeed
      ));
    const ICR_hintAddress_287 = await contracts.troveManager.getNominalICR(
      hintAddress
    );
    const ICRPercent_hintAddress_287 =
      Number(ethers.utils.formatUnits(ICR_hintAddress_287, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    const ICR_Difference_287 = ICRPercent_hintAddress_287 - CRPercent_287;
    assert.isBelow(ICR_Difference_287, sqrtLength);

    // CR = 213%
    const CR_213 = "2130000000000000000";
    const CRPercent_213 =
      Number(ethers.utils.formatUnits(CR_213, "ether")) * 100;

    // const hintAddress_213 = await functionCaller.troveManager_getApproxHint(CR_213, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } =
      await contracts.hintHelpers.getApproxHint(
        CR_213,
        sqrtLength * 10,
        latestRandomSeed
      ));
    const ICR_hintAddress_213 = await contracts.troveManager.getNominalICR(
      hintAddress
    );
    const ICRPercent_hintAddress_213 =
      Number(ethers.utils.formatUnits(ICR_hintAddress_213, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    const ICR_Difference_213 = ICRPercent_hintAddress_213 - CRPercent_213;
    assert.isBelow(ICR_Difference_213, sqrtLength);

    // CR = 201%
    const CR_201 = "2010000000000000000";
    const CRPercent_201 =
      Number(ethers.utils.formatUnits(CR_201, "ether")) * 100;

    //  const hintAddress_201 = await functionCaller.troveManager_getApproxHint(CR_201, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } =
      await contracts.hintHelpers.getApproxHint(
        CR_201,
        sqrtLength * 10,
        latestRandomSeed
      ));
    const ICR_hintAddress_201 = await contracts.troveManager.getNominalICR(
      hintAddress
    );
    const ICRPercent_hintAddress_201 =
      Number(ethers.utils.formatUnits(ICR_hintAddress_201, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    const ICR_Difference_201 = ICRPercent_hintAddress_201 - CRPercent_201;
    assert.isBelow(ICR_Difference_201, sqrtLength);
  });
  /* Pass 100 random collateral ratios to getApproxHint(). For each, check whether the returned hint address is within
  sqrt(length) positions of where a Trove with that CR should be inserted. */
  it("getApproxHint(): for 100 random CRs, returns the address of a Trove within sqrt(length) positions of the correct insert position", async () => {
    const sqrtLength = Math.ceil(Math.sqrt(numAccounts));
    let hintAddress;

    for (let i = 0; i < 100; i++) {
      // get random ICR between 200% and (200 + numAccounts)%
      const min = 200;
      const max = 200 + numAccounts;
      const ICR_Percent = Math.floor(Math.random() * (max - min) + min);

      // Convert ICR to a duint
      const ICR = ethers.utils.parseUnits(
        (ICR_Percent * 10).toString(),
        "finney"
      );
      ({ hintAddress, latestRandomSeed } =
        await contracts.hintHelpers.getApproxHint(
          ICR.toString(),
          sqrtLength * 10,
          latestRandomSeed
        ));
      const ICR_hintAddress = await contracts.troveManager.getNominalICR(
        hintAddress
      );
      const ICRPercent_hintAddress =
        Number(ethers.utils.formatUnits(ICR_hintAddress, "ether")) * 100;

      // check the hint position is at most sqrtLength positions away from the correct position
      const ICR_Difference = ICRPercent_hintAddress - ICR_Percent;
      // console.log(`ICR_Percent: ${ICR_Percent}, ICR: ${ICR.toString()}, ICRDifference: ${ICR_Difference.toString()}, ICR_hintAddress: ${ICR_hintAddress.toString()}, ICRPercent_hintAddress: ${ICRPercent_hintAddress.toString()}`)
      assert.isBelow(ICR_Difference, sqrtLength);
    }
  });
  it("getApproxHint(): returns the head of the list if the CR is the max uint256 value", async () => {
    const sqrtLength = Math.ceil(Math.sqrt(numAccounts));

    // CR = Maximum value, i.e. 2**256 -1
    const CR_Max =
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    let hintAddress;

    // const hintAddress_Max = await functionCaller.troveManager_getApproxHint(CR_Max, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } =
      await contracts.hintHelpers.getApproxHint(
        CR_Max,
        sqrtLength * 10,
        latestRandomSeed
      ));

    const ICR_hintAddress_Max = await contracts.troveManager.getNominalICR(
      hintAddress
    );
    const ICRPercent_hintAddress_Max =
      Number(ethers.utils.formatUnits(ICR_hintAddress_Max, "wei")) * 100;

    const firstTrove = await contracts.sortedTroves.getFirst();
    const ICR_FirstTrove = await contracts.troveManager.getNominalICR(
      firstTrove
    );
    const ICRPercent_FirstTrove =
      Number(ethers.utils.formatUnits(ICR_FirstTrove, "wei")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    const ICR_Difference_Max =
      ICRPercent_hintAddress_Max - ICRPercent_FirstTrove;
    assert.isBelow(ICR_Difference_Max, sqrtLength);
  });

  it("getApproxHint(): returns the tail of the list if the CR is lower than ICR of any Trove", async () => {
    const sqrtLength = Math.ceil(Math.sqrt(numAccounts));

    // CR = MCR
    const CR_Min = "1100000000000000000";

    let hintAddress;

    //  const hintAddress_Min = await functionCaller.troveManager_getApproxHint(CR_Min, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } =
      await contracts.hintHelpers.getApproxHint(
        CR_Min,
        sqrtLength * 10,
        latestRandomSeed
      ));
    const ICR_hintAddress_Min = await contracts.troveManager.getNominalICR(
      hintAddress
    );
    const ICRPercent_hintAddress_Min =
      Number(ethers.utils.formatUnits(ICR_hintAddress_Min, "wei")) * 100;

    const lastTrove = await contracts.sortedTroves.getLast();
    const ICR_LastTrove = await contracts.troveManager.getNominalICR(lastTrove);
    const ICRPercent_LastTrove =
      Number(ethers.utils.formatUnits(ICR_LastTrove, "wei")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    const ICR_Difference_Min =
      ICRPercent_hintAddress_Min - ICRPercent_LastTrove;
    assert.isBelow(ICR_Difference_Min, sqrtLength);
  });

  it("computeNominalCR()", async () => {
    const NICR = await contracts.hintHelpers.computeNominalCR(
      dec(3, 18),
      dec(200, 18)
    );
    assert.equal(NICR.toString(), dec(150, 16).toString());
  });
});
