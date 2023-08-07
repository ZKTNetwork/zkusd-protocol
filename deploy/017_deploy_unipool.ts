import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import UniswapV2FactoryABI from "../utils/@uniswap/v2-core/UniswapV2Factory.json";

import fs from "fs";
import path from "path";

const params = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../deploy/params.json")).toString()
)[network.name];

const createV2AMMPool = async function (): Promise<string> {
  const [signer] = await ethers.getSigners();
  const zkusdToken = await ethers.getContract("ZKUSDToken");
  const uniFactory = new ethers.Contract(
    params.V2Factory,
    UniswapV2FactoryABI,
    signer
  );
  let wrap_token_address: string = params.Wrap;
  let rusd_wrap_address = await uniFactory.getPair(
    zkusdToken.address,
    wrap_token_address
  );
  if (rusd_wrap_address == ethers.constants.AddressZero) {
    const tx = await uniFactory.createPair(
      wrap_token_address,
      zkusdToken.address
    );
    await tx.wait();
    rusd_wrap_address = await uniFactory.getPair(
      zkusdToken.address,
      wrap_token_address
    );
  }
  console.log(`ZKUSD_WCFX_LP: ${rusd_wrap_address}`);
  return rusd_wrap_address;
};

const deployUnipool = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployedResult = await deploy("Unipool", {
    from: deployer,
    log: true,
  });
  let lpStr: string = await createV2AMMPool();
  if (lpStr === "") {
    throw new Error("create pair/pool failed");
  }
  const bountyAddress =
    params.bountyAddress === "" ? deployer : params.bountyAddress;
  const multiSigAddress =
    params.multiSigAddress === "" ? deployer : params.multiSigAddress;
  await deployZKToken(
    hre,
    bountyAddress,
    deployedResult.address,
    multiSigAddress
  );
  const zkToken = await ethers.getContract("ZKToken");

  const SECONDS_IN_SIX_WEEKS = 60 * 60 * 24 * 7 * 6;
  const unipool = await ethers.getContractAt("Unipool", deployedResult.address);
  const unipoolSetParamsTx = await unipool.setParams(
    zkToken.address,
    lpStr,
    SECONDS_IN_SIX_WEEKS
  );
  await unipoolSetParamsTx.wait();
  console.log("UniPool setParams finished: ", unipoolSetParamsTx.hash);
};

const deployZKToken = async function (
  hre: HardhatRuntimeEnvironment,
  bountyAddress: string,
  unipool: string,
  multiSigAddress: string
) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const communityIssuance = await ethers.getContract("CommunityIssuance");
  const zktStaking = await ethers.getContract("ZKTStaking");
  const lockupContractFactory = await ethers.getContract(
    "LockupContractFactory"
  );
  await deploy("ZKToken", {
    from: deployer,
    log: true,
    args: [
      communityIssuance.address,
      zktStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      unipool,
      multiSigAddress,
    ],
  });
};

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  if (params.V2Factory !== "") {
    await deployUnipool(hre);
  } else {
    const bountyAddress =
      params.bountyAddress === "" ? deployer : params.bountyAddress;
    const multiSigAddress =
      params.multiSigAddress === "" ? deployer : params.multiSigAddress;
    await deployZKToken(
      hre,
      bountyAddress,
      ethers.constants.AddressZero,
      multiSigAddress
    );
  }
};

export default func;
func.id = "deploy_uni_pool";
func.tags = ["DeployUniPool"];
func.dependencies = [
  "DeployZKUSDToken",
  "DeployCommunityIssuance",
  "DeployZKTStaking",
  "DeployLockupContractFactory",
];
