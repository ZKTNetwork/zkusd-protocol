import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { network } from "hardhat";
import fs from "fs";
import path from "path";

const params = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../deploy/params.json")).toString()
)[network.name];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!params.useMock) {
    await deploy("WitnetPriceFeed", {
      from: deployer,
      log: true,
    });
  } else {
    await deploy("PriceFeedTestnet", {
      from: deployer,
      log: true,
    });
  }
};

export default func;
func.id = "deploy_pricefeed";
func.tags = ["DeployPriceFeed"];
