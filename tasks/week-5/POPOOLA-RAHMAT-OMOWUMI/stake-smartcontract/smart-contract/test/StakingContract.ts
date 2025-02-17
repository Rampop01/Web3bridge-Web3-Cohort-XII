import { expect } from "chai";
import { ethers } from "hardhat";
import { parseUnits } from "ethers/lib/utils";
import { time } from "@openzeppelin/test-helpers";

// Import types generated by TypeChain
import { StakingContract } from "../typechain";
import { Signer } from "ethers";

describe("StakingContract", function () {
  let stakingContract: StakingContract;
  let token: any;  // Token contract type
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;

  const MIN_STAKING_PERIOD = 60 * 60 * 24 * 7; // 7 days
  const REWARD_RATE = 10; // 10%

  beforeEach(async () => {
    // Get signers
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy ERC20 token
    const Token = await ethers.getContractFactory("ERC20");
    token = await Token.deploy("TestToken", "TT", parseUnits("1000000", 18));
    await token.deployed();

    // Deploy StakingContract
    const StakingContractFactory = await ethers.getContractFactory("StakingContract");
    stakingContract = await StakingContractFactory.deploy(token.address, MIN_STAKING_PERIOD);
    await stakingContract.deployed();

    // Mint tokens to users for testing
    await token.transfer(await user1.getAddress(), parseUnits("1000", 18));
    await token.transfer(await user2.getAddress(), parseUnits("1000", 18));
  });

  describe("Staking functionality", function () {
    it("should allow users to stake tokens", async function () {
      const stakeAmount = parseUnits("100", 18);
      await token.connect(user1).approve(stakingContract.address, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);

      const stakedAmount = await stakingContract.stakedAmount(await user1.getAddress());
      expect(stakedAmount).to.equal(stakeAmount);
    });

    it("should revert if the user does not have enough balance to stake", async function () {
      const stakeAmount = parseUnits("2000", 18);
      await token.connect(user1).approve(stakingContract.address, stakeAmount);
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWith("InsufficientBalance");
    });

    it("should revert if the stake amount is zero", async function () {
      await expect(stakingContract.connect(user1).stake(0))
        .to.be.revertedWith("InvalidAmount");
    });
  });

  describe("Unstaking functionality", function () {
    it("should allow users to unstake tokens after the minimum staking period", async function () {
      const stakeAmount = parseUnits("100", 18);
      await token.connect(user1).approve(stakingContract.address, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);

      // Fast forward time to meet staking period requirement
      await time.increase(MIN_STAKING_PERIOD);

      await expect(stakingContract.connect(user1).unstake())
        .to.emit(stakingContract, "TokensUnstaked")
        .withArgs(await user1.getAddress(), stakeAmount, 0); // No reward yet, since no time has passed

      const stakedAmount = await stakingContract.stakedAmount(await user1.getAddress());
      expect(stakedAmount).to.equal(0);
    });

    it("should revert if the minimum staking period is not met", async function () {
      const stakeAmount = parseUnits("100", 18);
      await token.connect(user1).approve(stakingContract.address, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);

      // Try to unstake before the staking period
      await expect(stakingContract.connect(user1).unstake())
        .to.be.revertedWith("StakingPeriodNotMet");
    });
  });

  describe("Reward calculation", function () {
    it("should calculate rewards correctly based on staking time", async function () {
      const stakeAmount = parseUnits("100", 18);
      await token.connect(user1).approve(stakingContract.address, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);

      // Fast forward time to meet staking period requirement
      await time.increase(MIN_STAKING_PERIOD);

      const reward = await stakingContract.calculateReward(await user1.getAddress());
      const expectedReward = (stakeAmount * REWARD_RATE * MIN_STAKING_PERIOD) / (100 * MIN_STAKING_PERIOD);
      expect(reward).to.equal(expectedReward);
    });

    it("should return zero reward if the user is not staking", async function () {
      const reward = await stakingContract.calculateReward(await user2.getAddress());
      expect(reward).to.equal(0);
    });
  });

  describe("Access control", function () {
    it("should allow only the owner to perform owner-only actions", async function () {
      await expect(stakingContract.connect(user1).unstake())
        .to.be.revertedWith("Unauthorized");
    });
  });
});
