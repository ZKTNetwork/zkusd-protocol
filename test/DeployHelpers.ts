import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import fs from "fs";
import path from "path";

import {
  ZKUSDToken,
  ZKToken,
  CommunityIssuance,
  LockupContractFactory,
  Unipool,
  ActivePool,
  CollSurplusPool,
  DefaultPool,
  SortedTroves,
  StabilityPoolTester,
  BorrowerOperationsTester,
  TroveManagerTester,
  HintHelpers,
  WrapToken,
  PriceFeedTestnet,
  TestUniswapV2Factory,
  ZKTStaking,
} from "../typechain-types";

export interface TestEnv {
  deployer: Signer;
  bounty: Signer;
  multiSig: Signer;
  treasury: Signer;
  feeToSetter: Signer;
  users: Signer[];
  wrapToken: WrapToken;
  v2Factory: TestUniswapV2Factory;
  v2Pair: string;
  zkusdToken: ZKUSDToken;
  zkToken: ZKToken;
  zktStaking: ZKTStaking;
  communityIssuance: CommunityIssuance;
  lockupContractFactory: LockupContractFactory;
  uniPool: Unipool;
  activePool: ActivePool;
  borrowerOperations: BorrowerOperationsTester;
  collSurplusPool: CollSurplusPool;
  defaultPool: DefaultPool;
  sortedTroves: SortedTroves;
  stabilityPool: StabilityPoolTester;
  troveManager: TroveManagerTester;
  priceFeed: PriceFeedTestnet;
  hintHelpers: HintHelpers;
  gasPool: Contract;
}

export const deployFunction = async (
  name: string,
  deployer: Signer,
  args: any[] = []
) => {
  const factory = await ethers.getContractFactory(name, deployer);
  const contract = await factory.deploy(...args);
  await contract.deployed();
  return contract;
};

export class DeployHelpers {
  deployParamsFile = path.join(__dirname, "../deploy/params.json");
  testEnv: TestEnv = {
    deployer: {} as Signer,
    bounty: {} as Signer,
    multiSig: {} as Signer,
    treasury: {} as Signer,
    feeToSetter: {} as Signer,
    users: [] as Signer[],
    v2Factory: {} as TestUniswapV2Factory,
    wrapToken: {} as WrapToken,
    v2Pair: "",
    zktStaking: {} as ZKTStaking,
    zkusdToken: {} as ZKUSDToken,
    zkToken: {} as ZKToken,
    communityIssuance: {} as CommunityIssuance,
    lockupContractFactory: {} as LockupContractFactory,
    uniPool: {} as Unipool,
    activePool: {} as ActivePool,
    borrowerOperations: {} as BorrowerOperationsTester,
    collSurplusPool: {} as CollSurplusPool,
    defaultPool: {} as DefaultPool,
    sortedTroves: {} as SortedTroves,
    stabilityPool: {} as StabilityPoolTester,
    troveManager: {} as TroveManagerTester,
    priceFeed: {} as PriceFeedTestnet,
    hintHelpers: {} as HintHelpers,
    gasPool: {} as Contract,
  };

  async generateDeployParams(
    v2Factory: string,
    wrapToken: string,
    bountyAddress: string,
    multiSigAddress: string,
    treasuryAddress: string
  ) {
    const params = JSON.parse(
      fs.readFileSync(this.deployParamsFile).toString()
    );
    params.hardhat = {
      V2Factory: v2Factory,
      PriceFeedId: "0x65784185",
      PriceRouter: "0x49c0bcce51a8b28f92d008394f06d5b259657f33",
      Wrap: wrapToken,
      bountyAddress: bountyAddress,
      multiSigAddress: multiSigAddress,
      treasuryAddress: treasuryAddress,
      useMock: true,
    };
    fs.writeFileSync(this.deployParamsFile, JSON.stringify(params, null, 2));
  }

  async runBeforeInitialize() {
    const [deployer, bounty, multiSig, treasury, feeToSetter, ...users] =
      await ethers.getSigners();
    this.testEnv.deployer = deployer;
    this.testEnv.bounty = bounty;
    this.testEnv.multiSig = multiSig;
    this.testEnv.treasury = treasury;
    this.testEnv.feeToSetter = feeToSetter;
    this.testEnv.users = users;
  }

  async runDeployCore() {
    // console.time("setup");
    this.testEnv.wrapToken = (await deployFunction(
      "WrapToken",
      this.testEnv.deployer
    )) as WrapToken;
    this.testEnv.v2Factory = (await deployFunction(
      "TestUniswapV2Factory",
      this.testEnv.deployer,
      [await this.testEnv.feeToSetter.getAddress()]
    )) as TestUniswapV2Factory;

    this.testEnv.priceFeed = (await deployFunction(
      "PriceFeedTestnet",
      this.testEnv.deployer
    )) as PriceFeedTestnet;
    this.testEnv.defaultPool = (await deployFunction(
      "DefaultPool",
      this.testEnv.deployer
    )) as DefaultPool;
    this.testEnv.collSurplusPool = (await deployFunction(
      "CollSurplusPool",
      this.testEnv.deployer
    )) as CollSurplusPool;
    this.testEnv.activePool = (await deployFunction(
      "ActivePool",
      this.testEnv.deployer
    )) as ActivePool;
    this.testEnv.stabilityPool = (await deployFunction(
      "StabilityPoolTester",
      this.testEnv.deployer
    )) as StabilityPoolTester;
    this.testEnv.sortedTroves = (await deployFunction(
      "SortedTroves",
      this.testEnv.deployer
    )) as SortedTroves;
    this.testEnv.borrowerOperations = (await deployFunction(
      "BorrowerOperationsTester",
      this.testEnv.deployer
    )) as BorrowerOperationsTester;
    this.testEnv.troveManager = (await deployFunction(
      "TroveManagerTester",
      this.testEnv.deployer
    )) as TroveManagerTester;
    this.testEnv.lockupContractFactory = (await deployFunction(
      "LockupContractFactory",
      this.testEnv.deployer
    )) as LockupContractFactory;
    this.testEnv.zktStaking = (await deployFunction(
      "ZKTStaking",
      this.testEnv.deployer,
      [await this.testEnv.deployer.getAddress()]
    )) as ZKTStaking;
    this.testEnv.zkusdToken = (await deployFunction(
      "ZKUSDToken",
      this.testEnv.deployer,
      [
        this.testEnv.troveManager.address,
        this.testEnv.stabilityPool.address,
        this.testEnv.borrowerOperations.address,
      ]
    )) as ZKUSDToken;
    this.testEnv.communityIssuance = (await deployFunction(
      "CommunityIssuance",
      this.testEnv.deployer
    )) as CommunityIssuance;
    this.testEnv.gasPool = await deployFunction(
      "GasPool",
      this.testEnv.deployer
    );
    this.testEnv.hintHelpers = (await deployFunction(
      "HintHelpers",
      this.testEnv.deployer
    )) as HintHelpers;
    this.testEnv.uniPool = (await deployFunction(
      "Unipool",
      this.testEnv.deployer
    )) as Unipool;
    this.testEnv.zkToken = (await deployFunction(
      "ZKToken",
      this.testEnv.deployer,
      [
        this.testEnv.communityIssuance.address,
        this.testEnv.zktStaking.address,
        this.testEnv.lockupContractFactory.address,
        await this.testEnv.bounty.getAddress(),
        this.testEnv.uniPool.address,
        await this.testEnv.multiSig.getAddress(),
      ]
    )) as ZKToken;

    await this.createV2AMM();
    await this.uniPoolSetParams();
    await this.sortedTrovesSetParams();
    await this.troveManagerSetAddresses();
    await this.borrowerOperationsSetAddresses();
    await this.stabilityPoolSetAddresses();
    await this.activePoolSetAddresses();
    await this.defaultPoolSetAddresses();
    await this.collSurplusPoolSetAddresses();
    await this.hintHelpersSetAddresses();
    await this.zktStakingSetAddresses();
    await this.communityIssuanceSetAddresses();
    // console.timeEnd("setup");
  }

  async sortedTrovesSetParams() {
    const setTx1 = await this.testEnv.sortedTroves.setParams(
      ethers.constants.MaxUint256,
      this.testEnv.troveManager.address,
      this.testEnv.borrowerOperations.address
    );
    await setTx1.wait();
  }

  async troveManagerSetAddresses() {
    const setTx2 = await this.testEnv.troveManager.setAddresses(
      this.testEnv.borrowerOperations.address,
      this.testEnv.activePool.address,
      this.testEnv.defaultPool.address,
      this.testEnv.stabilityPool.address,
      this.testEnv.gasPool.address,
      this.testEnv.collSurplusPool.address,
      this.testEnv.priceFeed.address,
      this.testEnv.zkusdToken.address,
      this.testEnv.sortedTroves.address,
      this.testEnv.zkToken.address,
      this.testEnv.zktStaking.address
    );
    await setTx2.wait();
  }

  async borrowerOperationsSetAddresses() {
    const setTx3 = await this.testEnv.borrowerOperations.setAddresses(
      this.testEnv.troveManager.address,
      this.testEnv.activePool.address,
      this.testEnv.defaultPool.address,
      this.testEnv.stabilityPool.address,
      this.testEnv.gasPool.address,
      this.testEnv.collSurplusPool.address,
      this.testEnv.priceFeed.address,
      this.testEnv.sortedTroves.address,
      this.testEnv.zkusdToken.address,
      this.testEnv.zktStaking.address
    );
    await setTx3.wait();
  }

  async stabilityPoolSetAddresses() {
    const setTx4 = await this.testEnv.stabilityPool.setAddresses(
      this.testEnv.borrowerOperations.address,
      this.testEnv.troveManager.address,
      this.testEnv.activePool.address,
      this.testEnv.zkusdToken.address,
      this.testEnv.sortedTroves.address,
      this.testEnv.priceFeed.address,
      this.testEnv.communityIssuance.address,
      await this.testEnv.treasury.getAddress()
    );
    await setTx4.wait();
  }

  async activePoolSetAddresses() {
    const setTx5 = await this.testEnv.activePool.setAddresses(
      this.testEnv.borrowerOperations.address,
      this.testEnv.troveManager.address,
      this.testEnv.stabilityPool.address,
      this.testEnv.defaultPool.address
    );
    await setTx5.wait();
  }

  async defaultPoolSetAddresses() {
    const setTx6 = await this.testEnv.defaultPool.setAddresses(
      this.testEnv.troveManager.address,
      this.testEnv.activePool.address
    );
    await setTx6.wait();
  }

  async collSurplusPoolSetAddresses() {
    const setTx7 = await this.testEnv.collSurplusPool.setAddresses(
      this.testEnv.borrowerOperations.address,
      this.testEnv.troveManager.address,
      this.testEnv.activePool.address
    );
    await setTx7.wait();
  }

  async hintHelpersSetAddresses() {
    const setTx8 = await this.testEnv.hintHelpers.setAddresses(
      this.testEnv.sortedTroves.address,
      this.testEnv.troveManager.address
    );
    await setTx8.wait();
  }

  async zktStakingSetAddresses() {
    const setTx9 = await this.testEnv.zktStaking.setAddresses(
      this.testEnv.zkToken.address,
      this.testEnv.zkusdToken.address,
      this.testEnv.troveManager.address,
      this.testEnv.borrowerOperations.address,
      this.testEnv.activePool.address
    );
    await setTx9.wait();
  }

  async communityIssuanceSetAddresses() {
    const setTx10 = await this.testEnv.communityIssuance.setAddresses(
      this.testEnv.zkToken.address,
      this.testEnv.stabilityPool.address
    );
    await setTx10.wait();
  }

  async uniPoolSetParams() {
    const SECONDS_IN_SIX_WEEKS = 60 * 60 * 24 * 7 * 6;
    const unipoolSetParamsTx = await this.testEnv.uniPool.setParams(
      this.testEnv.zkToken.address,
      this.testEnv.v2Pair,
      SECONDS_IN_SIX_WEEKS
    );
    await unipoolSetParamsTx.wait();
  }

  async createV2AMM() {
    this.testEnv.v2Pair = await this.testEnv.v2Factory.getPair(
      this.testEnv.zkusdToken.address,
      this.testEnv.wrapToken.address
    );
    if (this.testEnv.v2Pair == ethers.constants.AddressZero) {
      const tx = await this.testEnv.v2Factory.createPair(
        this.testEnv.wrapToken.address,
        this.testEnv.zkusdToken.address
      );
      await tx.wait();
      this.testEnv.v2Pair = await this.testEnv.v2Factory.getPair(
        this.testEnv.wrapToken.address,
        this.testEnv.zkusdToken.address
      );
    }
  }
}
