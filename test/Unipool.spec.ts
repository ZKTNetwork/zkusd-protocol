import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { TestHelper as th, ContractType, MoneyValues } from "./TestHelpers";
import { DeployHelpers, deployFunction } from "./DeployHelpers";
import { ERC20Mock, NonPayable, ZKToken, Unipool } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const _1e18 = MoneyValues._1E18BN;

const address = async (account: Signer) => {
  return await account.getAddress();
};

const getTimeLatest = async () => {
  const block = await ethers.provider.getBlock("latest");
  return BigNumber.from(block.timestamp);
};

const almostEqualDiv1e18 = function (
  expectedOrig: BigNumber,
  actualOrig: BigNumber
) {
  const expected = expectedOrig.div(_1e18);
  const actual = actualOrig.div(_1e18);
  assert.isTrue(
    expected.eq(actual) ||
      expected.add(1).eq(actual) ||
      expected.add(2).eq(actual) ||
      actual.add(1).eq(expected) ||
      actual.add(2).eq(expected),
    `expected ${actualOrig} to be almost equal ${expectedOrig}, expected ${actualOrig} to be different from ${expectedOrig}`
  );
};

describe("Unipool", () => {
  let dh = new DeployHelpers();
  let multiSig: Signer;
  let wallet1: Signer;
  let wallet2: Signer;
  let wallet3: Signer;
  let wallet4: Signer;
  let bounty: Signer;
  let owner: Signer;
  let erc20: ERC20Mock;
  let communityIssuance: NonPayable;
  let rimeStaking: NonPayable;
  let lockupContractFactory: NonPayable;
  let zkToken: ZKToken;
  let pool: Unipool;
  let DURATION = BigNumber.from(6 * 7 * 24 * 60 * 60);
  let lpRewardsEntitlement: BigNumber;
  let rewardRate: BigNumber;

  beforeEach(async () => {
    await dh.runBeforeInitialize();
    bounty = dh.testEnv.bounty;
    multiSig = dh.testEnv.multiSig;
    wallet1 = dh.testEnv.users[0];
    wallet2 = dh.testEnv.users[1];
    wallet3 = dh.testEnv.users[2];
    wallet4 = dh.testEnv.users[3];
    owner = dh.testEnv.users[4];
    erc20 = (await deployFunction("ERC20Mock", owner, [
      "Uniswap token",
      "LPT",
      address(owner),
      0,
    ])) as ERC20Mock;
    pool = (await deployFunction("Unipool", dh.testEnv.deployer)) as Unipool;
    communityIssuance = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    rimeStaking = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    lockupContractFactory = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    zkToken = (await deployFunction("ZKToken", dh.testEnv.deployer, [
      communityIssuance.address,
      rimeStaking.address,
      lockupContractFactory.address,
      await bounty.getAddress(),
      pool.address,
      await multiSig.getAddress(),
    ])) as ZKToken;
    lpRewardsEntitlement = await zkToken.getLpRewardsEntitlement();
    rewardRate = lpRewardsEntitlement.div(DURATION);
    await erc20
      .connect(owner)
      .mint(
        await wallet1.getAddress(),
        ethers.utils.parseUnits("1000", "ether")
      );
    await erc20
      .connect(owner)
      .mint(
        await wallet2.getAddress(),
        ethers.utils.parseUnits("1000", "ether")
      );
    await erc20
      .connect(owner)
      .mint(
        await wallet3.getAddress(),
        ethers.utils.parseUnits("1000", "ether")
      );
    await erc20
      .connect(owner)
      .mint(
        await wallet4.getAddress(),
        ethers.utils.parseUnits("1000", "ether")
      );
    await erc20
      .connect(wallet1)
      .approve(pool.address, ethers.constants.MaxUint256);
    await erc20
      .connect(wallet2)
      .approve(pool.address, ethers.constants.MaxUint256);
    await erc20
      .connect(wallet3)
      .approve(pool.address, ethers.constants.MaxUint256);
    await erc20
      .connect(wallet4)
      .approve(pool.address, ethers.constants.MaxUint256);
    await pool.setParams(zkToken.address, erc20.address, DURATION);
  });
  it("Two stakers with the same stakes wait DURATION", async function () {
    almostEqualDiv1e18(await pool.rewardPerToken(), BigNumber.from("0"));
    expect(await pool.earned(wallet1.getAddress())).to.be.equal(
      BigNumber.from("0")
    );
    expect(await pool.earned(wallet2.getAddress())).to.be.equal(
      BigNumber.from("0")
    );

    const stake1 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet1).stake(stake1);
    const stakeTime1 = await time.latest();
    // time goes by... so slowly

    const stake2 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet2).stake(stake2);
    const stakeTime2 = await time.latest();

    await time.increaseTo(DURATION.add(stakeTime1));

    const timeDiff = stakeTime2 - stakeTime1;
    const rewardPerToken = rewardRate
      .mul(timeDiff)
      .mul(_1e18)
      .div(stake1)
      .add(
        rewardRate
          .mul(DURATION.sub(timeDiff))
          .mul(_1e18)
          .div(stake1.add(stake2))
      );
    const halfEntitlement = lpRewardsEntitlement.div(BigNumber.from(2));
    const earnedDiff = halfEntitlement.mul(timeDiff).div(DURATION);
    almostEqualDiv1e18(await pool.rewardPerToken(), rewardPerToken);
    almostEqualDiv1e18(
      await pool.earned(await wallet1.getAddress()),
      halfEntitlement.add(earnedDiff)
    );
    almostEqualDiv1e18(
      await pool.earned(await wallet2.getAddress()),
      halfEntitlement.sub(earnedDiff)
    );
  });

  it("Two stakers with the different (1:3) stakes wait DURATION", async function () {
    almostEqualDiv1e18(await pool.rewardPerToken(), BigNumber.from("0"));
    expect(await pool.earned(wallet1.getAddress())).to.be.equal(
      BigNumber.from("0")
    );
    expect(await pool.earned(wallet2.getAddress())).to.be.equal(
      BigNumber.from("0")
    );
    expect(await pool.balanceOf(wallet1.getAddress())).to.be.equal(
      BigNumber.from("0")
    );
    expect(await pool.balanceOf(wallet2.getAddress())).to.be.equal(
      BigNumber.from("0")
    );

    const stake1 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet1).stake(stake1);
    const stakeTime1 = await time.latest();

    const stake2 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet2).stake(stake2);
    const stakeTime2 = await time.latest();

    await time.increaseTo(DURATION.add(stakeTime1));

    const timeDiff = stakeTime2 - stakeTime1;
    const rewardPerToken1 = rewardRate.mul(timeDiff).mul(_1e18).div(stake1);
    const rewardPerToken2 = rewardRate
      .mul(DURATION.sub(timeDiff))
      .mul(_1e18)
      .div(stake1.add(stake2));
    const rewardPerToken = rewardPerToken1.add(rewardPerToken2);
    await almostEqualDiv1e18(await pool.rewardPerToken(), rewardPerToken);
    await almostEqualDiv1e18(
      await pool.earned(wallet1.getAddress()),
      rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18)
    );
    await almostEqualDiv1e18(
      await pool.earned(wallet2.getAddress()),
      rewardPerToken2.mul(stake2).div(_1e18)
    );
  });

  it("Two stakers with the different (1:3) stakes wait DURATION and DURATION/2", async function () {
    //
    // 1x: +--------------+
    // 3x:      +---------+
    //

    const stake1 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet1).stake(stake1);
    const stakeTime1 = await time.latest();

    await time.increaseTo(DURATION.div(BigNumber.from(3)).add(stakeTime1));

    const stake2 = ethers.utils.parseUnits("3", "ether");
    await pool.connect(wallet2).stake(stake2);
    const stakeTime2 = await time.latest();

    const timeDiff = stakeTime2 - stakeTime1;
    const rewardPerToken1 = rewardRate.mul(timeDiff).mul(_1e18).div(stake1);
    await almostEqualDiv1e18(await pool.rewardPerToken(), rewardPerToken1);
    await almostEqualDiv1e18(
      await pool.earned(await wallet1.getAddress()),
      rewardPerToken1.mul(stake1).div(_1e18)
    );
    expect(await pool.earned(await wallet2.getAddress())).to.be.equal("0");

    // Forward to week 3 and notifyReward weekly
    await time.increase(DURATION.mul(2).div(3));

    const rewardPerToken2 = rewardRate
      .mul(DURATION.sub(timeDiff))
      .mul(_1e18)
      .div(stake1.add(stake2));
    const rewardPerToken = rewardPerToken1.add(rewardPerToken2);
    await almostEqualDiv1e18(await pool.rewardPerToken(), rewardPerToken);
    await almostEqualDiv1e18(
      await pool.earned(await wallet1.getAddress()),
      rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet2.getAddress()),
      rewardPerToken2.mul(stake2).div(_1e18)
    );
  });

  it("Three stakers with the different (1:3:5) stakes wait different durations", async function () {
    //
    // 1x: +----------------+--------+
    // 3x:  +---------------+
    // 5x:         +-----------------+
    //

    const stake1 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet1).stake(stake1);
    const stakeTime1 = await time.latest();

    const stake2 = ethers.utils.parseUnits("3", "ether");
    await pool.connect(wallet2).stake(stake2);
    const stakeTime2 = await time.latest();

    await time.increaseTo(DURATION.div(BigNumber.from(3)).add(stakeTime1));

    const stake3 = ethers.utils.parseUnits("5", "ether");
    await pool.connect(wallet3).stake(stake3);
    const stakeTime3 = await time.latest();

    const timeDiff1 = stakeTime2 - stakeTime1;
    const timeDiff2 = stakeTime3 - stakeTime2;
    const rewardPerToken1 = rewardRate.mul(timeDiff1).mul(_1e18).div(stake1);
    const rewardPerToken2 = rewardRate
      .mul(timeDiff2)
      .mul(_1e18)
      .div(stake1.add(stake2));
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1.add(rewardPerToken2)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet1.getAddress()),
      rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet2.getAddress()),
      rewardPerToken2.mul(stake2).div(_1e18)
    );

    await time.increaseTo(DURATION.mul(2).div(3).add(stakeTime1));

    await pool.connect(wallet2).withdrawAndClaim();
    const exitTime2 = await time.latest();

    const timeDiff3 = exitTime2 - stakeTime3;
    const rewardPerToken3 = rewardRate
      .mul(timeDiff3)
      .mul(_1e18)
      .div(stake1.add(stake2).add(stake3));
    await almostEqualDiv1e18(
      rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3),
      await pool.rewardPerToken()
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet1.getAddress()),
      rewardPerToken1
        .add(rewardPerToken2)
        .add(rewardPerToken3)
        .mul(stake1)
        .div(_1e18)
    );
    expect(await pool.earned(await wallet2.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await zkToken.balanceOf(await wallet2.getAddress()),
      rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet3.getAddress()),
      rewardPerToken3.mul(stake3).div(_1e18)
    );

    await time.increaseTo(DURATION.add(stakeTime1));

    const timeDiff4 = DURATION.sub(exitTime2 - stakeTime1);
    const rewardPerToken4 = rewardRate
      .mul(timeDiff4)
      .mul(_1e18)
      .div(stake1.add(stake3));
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1
        .add(rewardPerToken2)
        .add(rewardPerToken3)
        .add(rewardPerToken4)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet1.getAddress()),
      rewardPerToken1
        .add(rewardPerToken2)
        .add(rewardPerToken3)
        .add(rewardPerToken4)
        .mul(stake1)
        .div(_1e18)
    );
    expect(await pool.earned(await wallet2.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await pool.earned(await wallet3.getAddress()),
      rewardPerToken3.add(rewardPerToken4).mul(stake3).div(_1e18)
    );
  });
  it("Four stakers with gaps of zero total supply", async function () {
    //
    // 1x: +-------+               |
    // 3x:  +----------+           |
    // 5x:                +------+ |
    // 1x:                         |  +------...
    //                             +-> end of initial duration

    const stake1 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet1).stake(stake1);
    const stakeTime1 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(DURATION.add(stakeTime1));

    const stake2 = ethers.utils.parseUnits("3", "ether");
    await pool.connect(wallet2).stake(stake2);
    const stakeTime2 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(DURATION.add(stakeTime1));

    await time.increase(DURATION.div(6));

    await pool.connect(wallet1).withdrawAndClaim();
    const exitTime1 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(DURATION.add(stakeTime1));

    const timeDiff1 = stakeTime2 - stakeTime1;
    const timeDiff2 = exitTime1 - stakeTime2;
    const rewardPerToken1 = rewardRate.mul(timeDiff1).mul(_1e18).div(stake1);
    const rewardPerToken2 = rewardRate
      .mul(timeDiff2)
      .mul(_1e18)
      .div(stake1.add(stake2));
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1.add(rewardPerToken2)
    );
    expect(await pool.earned(await wallet1.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await zkToken.balanceOf(await wallet1.getAddress()),
      rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet2.getAddress()),
      rewardPerToken2.mul(stake2).div(_1e18)
    );

    await time.increase(DURATION.div(6));

    await pool.connect(wallet2).withdrawAndClaim();
    const exitTime2 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(DURATION.add(stakeTime1));

    const timeDiff3 = exitTime2 - exitTime1;
    const rewardPerToken3 = rewardRate.mul(timeDiff3).mul(_1e18).div(stake2);
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3)
    );
    expect(await pool.earned(await wallet1.getAddress())).to.be.equal("0");
    expect(await pool.earned(await wallet2.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await zkToken.balanceOf(await wallet2.getAddress()),
      rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18)
    );

    await time.increase(DURATION.div(6));

    const stake3 = ethers.utils.parseUnits("5", "ether");
    await pool.connect(wallet3).stake(stake3);
    const stakeTime3 = await time.latest();

    const emptyPeriod1 = stakeTime3 - exitTime2;
    expect(await pool.periodFinish()).to.be.equal(
      DURATION.add(stakeTime1 + emptyPeriod1)
    );

    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3)
    );
    expect(await pool.earned(await wallet1.getAddress())).to.be.equal("0");
    expect(await pool.earned(await wallet2.getAddress())).to.be.equal("0");
    expect(await pool.earned(await wallet3.getAddress())).to.be.equal("0");

    await time.increase(DURATION.div(6));

    await pool.connect(wallet3).withdrawAndClaim();
    const exitTime3 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(
      DURATION.add(stakeTime1 + emptyPeriod1)
    );

    const timeDiff4 = exitTime3 - stakeTime3;
    const rewardPerToken4 = rewardRate.mul(timeDiff4).mul(_1e18).div(stake3);
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1
        .add(rewardPerToken2)
        .add(rewardPerToken3)
        .add(rewardPerToken4)
    );
    expect(await pool.earned(await wallet1.getAddress())).to.be.equal("0");
    expect(await pool.earned(await wallet2.getAddress())).to.be.equal("0");
    expect(await pool.earned(await wallet3.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await zkToken.balanceOf(await wallet3.getAddress()),
      rewardPerToken4.mul(stake3).div(_1e18)
    );

    await time.increase(DURATION.div(2));

    // check that we have reached initial duration
    expect(await time.latest()).to.be.gte(DURATION.add(stakeTime1));

    const stake4 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet4).stake(stake4);
    const stakeTime4 = await time.latest();

    const emptyPeriod2 = DURATION.add(stakeTime1)
      .add(emptyPeriod1)
      .sub(exitTime3);
    expect(await pool.periodFinish()).to.be.equal(emptyPeriod2.add(stakeTime4));

    await time.increase(DURATION.div(2));

    const timeDiff5 = DURATION.sub(exitTime2 - stakeTime1 + timeDiff4);
    const rewardPerToken5 = rewardRate.mul(timeDiff5).mul(_1e18).div(stake4);
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1
        .add(rewardPerToken2)
        .add(rewardPerToken3)
        .add(rewardPerToken4)
        .add(rewardPerToken5)
    );
    expect(await pool.earned(await wallet1.getAddress())).to.be.equal("0");
    expect(await pool.earned(await wallet2.getAddress())).to.be.equal("0");
    expect(await pool.earned(await wallet3.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await pool.earned(await wallet4.getAddress()),
      rewardPerToken5.mul(stake4).div(_1e18)
    );
  });

  it("Four stakers with gaps of zero total supply, with claims in between", async function () {
    //
    // 1x: +-------+               |
    // 3x:  +----------+           |
    // 5x:                +------+ |
    // 1x:                         |  +------...
    //                             +-> end of initial duration

    const stake1 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet1).stake(stake1);
    const stakeTime1 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(DURATION.add(stakeTime1));

    const stake2 = ethers.utils.parseUnits("3", "ether");
    await pool.connect(wallet2).stake(stake2);
    const stakeTime2 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(DURATION.add(stakeTime1));

    await time.increase(DURATION.div(6));

    await pool.connect(wallet1).withdraw(stake1);
    const exitTime1 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(DURATION.add(stakeTime1));

    const timeDiff1 = stakeTime2 - stakeTime1;
    const timeDiff2 = exitTime1 - stakeTime2;
    const rewardPerToken1 = rewardRate.mul(timeDiff1).mul(_1e18).div(stake1);
    const rewardPerToken2 = rewardRate
      .mul(timeDiff2)
      .mul(_1e18)
      .div(stake1.add(stake2));
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1.add(rewardPerToken2)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet1.getAddress()),
      rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet2.getAddress()),
      rewardPerToken2.mul(stake2).div(_1e18)
    );

    await time.increase(DURATION.div(6));

    await pool.connect(wallet2).withdraw(stake2);
    const exitTime2 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(DURATION.add(stakeTime1));

    const timeDiff3 = exitTime2 - exitTime1;
    const rewardPerToken3 = rewardRate.mul(timeDiff3).mul(_1e18).div(stake2);
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet1.getAddress()),
      rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18)
    );
    await almostEqualDiv1e18(
      await pool.earned(await wallet2.getAddress()),
      rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18)
    );

    await time.increase(DURATION.div(12));

    await pool.connect(wallet1).claimReward();

    await time.increase(DURATION.div(12));

    const stake3 = ethers.utils.parseUnits("5", "ether");
    await pool.connect(wallet3).stake(stake3);
    const stakeTime3 = await time.latest();

    const emptyPeriod1 = stakeTime3 - exitTime2;
    expect(await pool.periodFinish()).to.be.equal(
      DURATION.add(stakeTime1 + emptyPeriod1)
    );

    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3)
    );
    expect(await pool.earned(await wallet1.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await pool.earned(await wallet2.getAddress()),
      rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18)
    );
    expect(await pool.earned(await wallet3.getAddress())).to.be.equal("0");

    await time.increase(DURATION.div(6));

    await pool.connect(wallet3).withdraw(stake3);
    const exitTime3 = await time.latest();

    expect(await pool.periodFinish()).to.be.equal(
      DURATION.add(stakeTime1 + emptyPeriod1)
    );

    const timeDiff4 = exitTime3 - stakeTime3;
    const rewardPerToken4 = rewardRate.mul(timeDiff4).mul(_1e18).div(stake3);
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1
        .add(rewardPerToken2)
        .add(rewardPerToken3)
        .add(rewardPerToken4)
    );
    expect(await pool.earned(await wallet1.getAddress())).to.be.equal("0");
    expect(await pool.earned(await wallet2.getAddress())).to.be.equal(
      rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18)
    );
    expect(await pool.earned(await wallet3.getAddress())).to.be.equal(
      rewardPerToken4.mul(stake3).div(_1e18)
    );

    await time.increase(DURATION.div(2));

    // check that we have reached initial duration
    expect(await time.latest()).to.be.gte(DURATION.add(stakeTime1));

    await pool.connect(wallet3).claimReward();

    await time.increase(DURATION.div(12));

    const stake4 = ethers.utils.parseUnits("1", "ether");
    await pool.connect(wallet4).stake(stake4);
    const stakeTime4 = await time.latest();

    const emptyPeriod2 = DURATION.add(stakeTime1 + emptyPeriod1).sub(exitTime3);
    expect(await pool.periodFinish()).to.be.equal(emptyPeriod2.add(stakeTime4));

    await time.increase(DURATION.div(2));

    const timeDiff5 = DURATION.sub(exitTime2 - stakeTime1 + timeDiff4);
    const rewardPerToken5 = rewardRate.mul(timeDiff5).mul(_1e18).div(stake4);
    await almostEqualDiv1e18(
      await pool.rewardPerToken(),
      rewardPerToken1
        .add(rewardPerToken2)
        .add(rewardPerToken3)
        .add(rewardPerToken4)
        .add(rewardPerToken5)
    );
    expect(await pool.earned(await wallet1.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await pool.earned(await wallet2.getAddress()),
      rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18)
    );
    expect(await pool.earned(await wallet3.getAddress())).to.be.equal("0");
    await almostEqualDiv1e18(
      await pool.earned(await wallet4.getAddress()),
      rewardPerToken5.mul(stake4).div(_1e18)
    );
  });
});

describe("Unipool, before calling setAddresses", async function () {
  let dh = new DeployHelpers();
  let multiSig: Signer;
  let wallet1: Signer;
  let wallet2: Signer;
  let wallet3: Signer;
  let wallet4: Signer;
  let bounty: Signer;
  let owner: Signer;
  let erc20: ERC20Mock;
  let communityIssuance: NonPayable;
  let rimeStaking: NonPayable;
  let lockupContractFactory: NonPayable;
  let zkToken: ZKToken;
  let pool: Unipool;
  let DURATION = BigNumber.from(6 * 7 * 24 * 60 * 60);
  let lpRewardsEntitlement: BigNumber;
  let rewardRate: BigNumber;
  beforeEach(async function () {
    await dh.runBeforeInitialize();
    bounty = dh.testEnv.bounty;
    multiSig = dh.testEnv.multiSig;
    wallet1 = dh.testEnv.users[0];
    wallet2 = dh.testEnv.users[1];
    wallet3 = dh.testEnv.users[2];
    wallet4 = dh.testEnv.users[3];
    owner = dh.testEnv.users[4];
    erc20 = (await deployFunction("ERC20Mock", owner, [
      "Uniswap token",
      "LPT",
      address(owner),
      0,
    ])) as ERC20Mock;
    pool = (await deployFunction("Unipool", dh.testEnv.deployer)) as Unipool;
    communityIssuance = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    rimeStaking = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    lockupContractFactory = (await deployFunction(
      "NonPayable",
      dh.testEnv.deployer
    )) as NonPayable;
    zkToken = (await deployFunction("ZKToken", dh.testEnv.deployer, [
      communityIssuance.address,
      rimeStaking.address,
      lockupContractFactory.address,
      await bounty.getAddress(),
      pool.address,
      await multiSig.getAddress(),
    ])) as ZKToken;
    lpRewardsEntitlement = await zkToken.getLpRewardsEntitlement();
    rewardRate = lpRewardsEntitlement.div(DURATION);
    await erc20
      .connect(owner)
      .mint(
        await wallet1.getAddress(),
        ethers.utils.parseUnits("1000", "ether")
      );
    await erc20
      .connect(owner)
      .mint(
        await wallet2.getAddress(),
        ethers.utils.parseUnits("1000", "ether")
      );
    await erc20
      .connect(owner)
      .mint(
        await wallet3.getAddress(),
        ethers.utils.parseUnits("1000", "ether")
      );
    await erc20
      .connect(owner)
      .mint(
        await wallet4.getAddress(),
        ethers.utils.parseUnits("1000", "ether")
      );
    await erc20
      .connect(wallet1)
      .approve(pool.address, ethers.constants.MaxUint256);
    await erc20
      .connect(wallet2)
      .approve(pool.address, ethers.constants.MaxUint256);
    await erc20
      .connect(wallet3)
      .approve(pool.address, ethers.constants.MaxUint256);
    await erc20
      .connect(wallet4)
      .approve(pool.address, ethers.constants.MaxUint256);
  });

  it("Stake fails", async function () {
    const stake1 = ethers.utils.parseUnits("1", "ether");
    await expect(pool.connect(wallet1).stake(stake1)).to.be.revertedWith(
      "ZKTProtocol Pool Token has not been set yet"
    );
  });

  it("Withdraw falis", async function () {
    const stake1 = ethers.utils.parseUnits("1", "ether");
    await expect(pool.connect(wallet1).withdraw(stake1)).to.be.revertedWith(
      "ZKTProtocol Pool Token has not been set yet"
    );
  });

  it("Claim fails", async function () {
    await expect(pool.connect(wallet1).claimReward()).to.be.revertedWith(
      "ZKTProtocol Pool Token has not been set yet"
    );
  });

  it("Exit fails", async function () {
    await expect(pool.connect(wallet1).withdrawAndClaim()).to.be.revertedWith(
      "Cannot withdraw 0"
    );
  });
});
