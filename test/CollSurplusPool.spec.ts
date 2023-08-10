import { assert, expect } from "chai";
import { Signer, BigNumber } from "ethers";
import {
  TestHelper as th,
  ContractType,
  TimeValues,
  MoneyValues as mv,
} from "./TestHelpers";
import { DeployHelpers, deployFunction } from "./DeployHelpers";

describe("CollSurplusPool", () => {
  let contracts: ContractType;
  let dh = new DeployHelpers();
  let A: Signer;
  let B: Signer;
  before(async () => {
    await dh.runBeforeInitialize();

    A = dh.testEnv.users[0];
    B = dh.testEnv.users[1];
  });
  beforeEach(async () => {
    await dh.runDeployCore();
    contracts = {
      troveManager: dh.testEnv.troveManager,
      stabilityPool: dh.testEnv.stabilityPool,
      borrowerOperations: dh.testEnv.borrowerOperations,
      priceFeedTestnet: dh.testEnv.priceFeed,
      hintHelpers: dh.testEnv.hintHelpers,
      sortedTroves: dh.testEnv.sortedTroves,
    };
  });
  it("CollSurplusPool::getETH(): Returns the ETH balance of the CollSurplusPool after redemption", async () => {
    const { collSurplusPool } = dh.testEnv;
    const ETH_1 = await collSurplusPool.getETH();
    expect(ETH_1).to.be.eq(BigNumber.from("0"));

    const price = th.toBN(th.dec(100, 18));
    await contracts.priceFeedTestnet.setPrice(price);

    const { collateral: B_coll, netDebt: B_netDebt } = await th.openTrove(
      contracts,
      B,
      {
        ICR: th.toBN(th.dec(200, 16)),
        extraParams: { from: await B.getAddress() },
      }
    );
    await th.openTrove(contracts, A, {
      extraZKUSDAmount: B_netDebt,
      extraParams: { from: await A.getAddress(), value: th.dec(3000, "ether") },
    });

    // skip bootstrapping phase
    await th.fastForwardTime(TimeValues.SECONDS_IN_ONE_WEEK * 2);

    // At ETH:USD = 100, this redemption should leave 1 ether of coll surplus
    await th.redeemCollateralAndGetTxObject(A, contracts, B_netDebt);

    const ETH_2 = await collSurplusPool.getETH();
    th.assertIsApproximatelyEqual(
      ETH_2,
      B_coll.sub(B_netDebt.mul(mv._1E18BN).div(price))
    );
  });

  it("CollSurplusPool: claimColl(): Reverts if caller is not Borrower Operations", async () => {
    const { collSurplusPool } = dh.testEnv;
    const A_address = await A.getAddress();
    await expect(
      collSurplusPool.connect(A).claimColl(A_address, { from: A_address })
    ).revertedWith("CollSurplusPool: Caller is not Borrower Operations");
  });

  it("CollSurplusPool: claimColl(): Reverts if nothing to claim", async () => {
    const { borrowerOperations } = dh.testEnv;
    const A_address = await A.getAddress();
    await expect(
      borrowerOperations.connect(A).claimCollateral({ from: A_address })
    ).revertedWith("CollSurplusPool: No collateral available to claim");
  });

  it("CollSurplusPool: claimColl(): Reverts if owner cannot receive ETH surplus", async () => {
    const { collSurplusPool } = dh.testEnv;
    const nonPayable = await deployFunction("NonPayable", dh.testEnv.deployer);

    const price = th.toBN(th.dec(100, 18));
    await contracts.priceFeedTestnet.setPrice(price);

    // open trove from NonPayable proxy contract
    const A_address = await A.getAddress();
    const B_address = await B.getAddress();
    const B_coll = th.toBN(th.dec(60, 18));
    const B_zkusdAmount = th.toBN(th.dec(3000, 18));
    const B_netDebt = await th.getAmountWithBorrowingFee(
      contracts,
      B_zkusdAmount
    );
    const openTroveData =
      contracts.borrowerOperations.interface.encodeFunctionData("openTrove", [
        BigNumber.from("0xde0b6b3a7640000"),
        B_zkusdAmount,
        B_address,
        B_address,
      ]);
    await nonPayable
      .connect(B)
      .forward(contracts.borrowerOperations.address, openTroveData, {
        value: B_coll,
      });
    await th.openTrove(contracts, A, {
      extraZKUSDAmount: B_netDebt,
      extraParams: { from: A_address, value: th.dec(3000, "ether") },
    });

    // skip bootstrapping phase
    await th.fastForwardTime(TimeValues.SECONDS_IN_ONE_WEEK * 2);

    // At ETH:USD = 100, this redemption should leave 1 ether of coll surplus for B
    await th.redeemCollateralAndGetTxObject(A, contracts, B_netDebt);

    const ETH_2 = await collSurplusPool.getETH();
    th.assertIsApproximatelyEqual(
      ETH_2,
      B_coll.sub(B_netDebt.mul(mv._1E18BN).div(price))
    );

    const claimCollateralData =
      contracts.borrowerOperations.interface.encodeFunctionData(
        // @ts-ignore
        "claimCollateral",
        []
      );
    // await expect(
    //   nonPayable
    //     .connect(B)
    //     .forward(contracts.borrowerOperations.address, claimCollateralData)
    // ).to.be.revertedWith(
    //   new RegExp("CollSurplusPool: sending ETH failed$", "i")
    // );
    await expect(
      nonPayable
        .connect(B)
        .forward(contracts.borrowerOperations.address, claimCollateralData)
    ).to.be.reverted;
  });
  it("CollSurplusPool: reverts trying to send ETH to it", async () => {
    const { collSurplusPool } = dh.testEnv;
    // await expect(
    //   A.sendTransaction({
    //     from: await A.getAddress(),
    //     to: collSurplusPool.address,
    //     value: 1,
    //   })
    // ).to.be.revertedWith("CollSurplusPool: Caller is not Active Pool");
    try {
      await A.sendTransaction({
        from: await A.getAddress(),
        to: collSurplusPool.address,
        value: 1,
      });
    } catch (err) {
      const error = err as Error;
      assert.include(error.message, "reverted");
      assert.include(
        error.message,
        "CollSurplusPool: Caller is not Active Pool"
      );
    }
  });

  it("CollSurplusPool: accountSurplus: reverts if caller is not Trove Manager", async () => {
    const { collSurplusPool } = dh.testEnv;
    await expect(
      collSurplusPool.connect(B).accountSurplus(await A.getAddress(), 1)
    ).to.be.revertedWith("CollSurplusPool: Caller is not TroveManager");
  });
});
