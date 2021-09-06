const chai = require("chai");
const asPromised = require("chai-as-promised");
const { ethers, upgrades } = require("hardhat");
const { BigNumber, utils } = require("ethers");

const expect = chai.expect;
chai.use(asPromised);

describe("Market", function () {
  let weth;
  let idrt;
  let nfts = {}

  beforeEach(async function () {
    const WETH = await ethers.getContractFactory("WETH9");
    weth = await WETH.deploy();
    const IDRT = await ethers.getContractFactory("IDRT");
    idrt = await IDRT.deploy();

    const ERC721Test = await ethers.getContractFactory("ERC721Test");
    const ERC721Bad = await ethers.getContractFactory("ERC721Bad");
    nfts.test = await ERC721Test.deploy();
    nfts.bad = await ERC721Bad.deploy();
  });

  async function deploy () {
    const Market = await ethers.getContractFactory("Market");
    const market = await upgrades.deployProxy(Market, [
      weth.address
    ]);
    await market.deployed();

    const accounts = await ethers.getSigners();

    await market.setMarketTreasury(accounts[9].address);
    await market.setMarketFee(500);

    return market;
  }

  describe("Initialize", async function () {
    it("should be able to deploy", async function () {
      const Market = await ethers.getContractFactory("Market");
      const market = await upgrades.deployProxy(Market, [
        weth.address
      ]);
      
      expect(await market.wethAddress()).to.eq(
        weth.address,
        "incorrect weth address"
      );
    });

    it("should deployed for owner", async function () {
      const Market = await ethers.getContractFactory("Market");
      const market = await upgrades.deployProxy(Market, [
        weth.address
      ]);
      
      const accounts = await ethers.getSigners();

      expect(await market.owner()).to.eq(
        accounts[0].address,
        "incorrect owner address"
      );
    });

    it("should be able to set market treasury and fee", async function () {
      const Market = await ethers.getContractFactory("Market");
      const market = await upgrades.deployProxy(Market, [
        weth.address
      ]);
      await market.deployed();

      const accounts = await ethers.getSigners();

      await market.setMarketTreasury(accounts[9].address);
      await market.setMarketFee(500);

      const marketFee = BigNumber.from(500);
      expect(await market.marketTreasury()).to.eq(
        accounts[9].address,
        "incorrect treasury address"
      );
      expect(await market.marketFee()).to.eq(
        marketFee,
        "incorrect market fee"
      );
    });
  });

  describe("Create sell order", async function () {
    let market;

    beforeEach(async function () {
      market = await deploy();

      const accounts = await ethers.getSigners();
      await nfts.test.safeMint(accounts[0].address);

      await nfts.test.setApprovalForAll(
        market.address,
        true
      );
    });

    it("should revert for unsupported ERC721", async function () {
      const price = utils.parseEther("1");
      const sellOrder = market.createSellOrder(
        1,
        nfts.bad.address,
        price,
        ethers.constants.AddressZero
      );
      
      expect(sellOrder)
        .eventually
        .rejectedWith("Market: tokenContract does not support ERC721 interface");
    });

    it("should revert for non owner or approved", async function () {
      const price = utils.parseEther("1");
      const accounts = await ethers.getSigners();
      const sellOrder = market.connect(accounts[1]).createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );
    
      expect(sellOrder)
        .eventually
        .rejectedWith("Market: Caller must be approved or owner for tokenId");
    });

    it("should revert when tokenId does not exist", async function () {
      const price = utils.parseEther("1");
      const sellOrder = market.createSellOrder(
        100,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );
    
      expect(sellOrder)
        .eventually
        .rejectedWith("ERC721: owner query for nonexistent token");
    });

    it("should revert when price is zero", async function () {
      const sellOrder = market.createSellOrder(
        1,
        nfts.test.address,
        0,
        ethers.constants.AddressZero
      );
    
      expect(sellOrder)
        .eventually
        .rejectedWith("Market: Price cannot be zero");
    });

    it("should create a sell order", async function () {
      const price = utils.parseEther("1");
      const block = await ethers.provider.getBlockNumber();
      const sellOrder = await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );

      const events = await market.queryFilter(
        market.filters.OrderCreated(),
        block
      );
      expect(events.length).eq(1);

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");
      const log = market.interface.parseLog(events[0]);
      expect(log.name).to.eq("OrderCreated");
      expect(log.args.orderId).to.eq(expectedId);
      expect(log.args.orderType).to.eq(currentOrder.orderType);
      expect(log.args.tokenId).to.eq(currentOrder.tokenId);
      expect(log.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(log.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.reservePrice).to.eq(currentOrder.reservePrice);
      expect(log.args.duration).to.eq(currentOrder.duration);
      expect(log.args.extensionDuration).to.eq(currentOrder.extensionDuration);
      expect(log.args.currency).to.eq(currentOrder.currency);

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });

    it("should create a sell order with ERC20", async function () {
      const price = BigNumber.from("1000000");
      const block = await ethers.provider.getBlockNumber();
      const sellOrder = await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        idrt.address
      );

      const events = await market.queryFilter(
        market.filters.OrderCreated(),
        block
      );
      expect(events.length).eq(1);

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");
      const log = market.interface.parseLog(events[0]);
      expect(log.name).to.eq("OrderCreated");
      expect(log.args.orderId).to.eq(expectedId);
      expect(log.args.orderType).to.eq(currentOrder.orderType);
      expect(log.args.tokenId).to.eq(currentOrder.tokenId);
      expect(log.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(log.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.reservePrice).to.eq(currentOrder.reservePrice);
      expect(log.args.duration).to.eq(currentOrder.duration);
      expect(log.args.extensionDuration).to.eq(currentOrder.extensionDuration);
      expect(log.args.currency).to.eq(currentOrder.currency);

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });
  });

  describe("Create buy order", async function () {
    let market;

    beforeEach(async function () {
      market = await deploy();
      
      const ERC721Royalty = await ethers.getContractFactory("ERC721Royalty");
      const ERC721RoyaltyV1 = await ethers.getContractFactory("ERC721RoyaltyV1");
      const ERC721RoyaltyV2 = await ethers.getContractFactory("ERC721RoyaltyV2");
      nfts.royalty = await ERC721Royalty.deploy();
      nfts.royaltyV1 = await ERC721RoyaltyV1.deploy();
      nfts.royaltyV2 = await ERC721RoyaltyV2.deploy();

      const accounts = await ethers.getSigners();
      await nfts.test.safeMint(accounts[0].address);
      await nfts.royalty.safeMint(accounts[0].address, 500);
      await nfts.royaltyV1.safeMint(accounts[0].address, 500);
      await nfts.royaltyV2.safeMint(accounts[0].address, 500);

      await nfts.test.setApprovalForAll(market.address, true);
      await nfts.royalty.setApprovalForAll(market.address, true);
      await nfts.royaltyV1.setApprovalForAll(market.address, true);
      await nfts.royaltyV2.setApprovalForAll(market.address, true);
    });

    async function createBuyOrderRoyalty(royaltySchema) {
      const accounts = await ethers.getSigners();
      await nfts[royaltySchema]["safeTransferFrom(address,address,uint256)"](
        accounts[0].address,
        accounts[2].address,
        1
      );
      await nfts[royaltySchema].connect(accounts[2]).setApprovalForAll(
        market.address,
        true
      );

      const price = utils.parseEther("1");
      await market.connect(accounts[2]).createSellOrder(
        1,
        nfts[royaltySchema].address,
        price,
        ethers.constants.AddressZero
      );

      const lastBalance = await ethers.provider.getBalance(accounts[2].address);
      const creatorLastBalance = await ethers.provider.getBalance(accounts[0].address);
      const treasuryLastBalance = await ethers.provider.getBalance(accounts[9].address);
  
      await market.connect(accounts[1]).createBuyOrder(1, {
        value: price
      });

      const currentBalance = await ethers.provider.getBalance(accounts[2].address);
      const expectedProfit = BigNumber.from("900000000000000000");
      expect(currentBalance.sub(lastBalance)).to.eq(expectedProfit);

      const tokenOwner = await nfts[royaltySchema].ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const creatorBalance = await ethers.provider.getBalance(accounts[0].address);
      const expectedCreatorProfit = BigNumber.from("50000000000000000");
      expect(creatorBalance.sub(creatorLastBalance)).to.eq(expectedCreatorProfit);

      const treasuryBalance = await ethers.provider.getBalance(accounts[9].address);
      const expectedTreasuryProfit = BigNumber.from("50000000000000000");
      expect(treasuryBalance.sub(treasuryLastBalance)).to.eq(expectedTreasuryProfit);
    }

    async function createBuyOrderERC20Royalty(royaltySchema) {
      const accounts = await ethers.getSigners();
      await nfts[royaltySchema]["safeTransferFrom(address,address,uint256)"](
        accounts[0].address,
        accounts[2].address,
        1
      );
      await nfts[royaltySchema].connect(accounts[2]).setApprovalForAll(
        market.address,
        true
      );

      const price = BigNumber.from("1000000");
      await market.connect(accounts[2]).createSellOrder(
        1,
        nfts[royaltySchema].address,
        price,
        idrt.address
      );

      const balance = BigNumber.from("2000000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);
      const lastBalance = await idrt.balanceOf(accounts[2].address);
      const creatorLastBalance = await idrt.balanceOf(accounts[0].address);
      const treasuryLastBalance = await idrt.balanceOf(accounts[9].address);

      await market.connect(accounts[1]).createBuyOrder(1);

      const currentBalance = await idrt.balanceOf(accounts[2].address);
      const expectedProfit = BigNumber.from("900000");
      expect(currentBalance.sub(lastBalance)).to.eq(expectedProfit);

      const tokenOwner = await nfts[royaltySchema].ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const creatorBalance = await idrt.balanceOf(accounts[0].address);
      const expectedCreatorProfit = BigNumber.from("50000");
      expect(creatorBalance.sub(creatorLastBalance)).to.eq(expectedCreatorProfit);

      const treasuryBalance = await idrt.balanceOf(accounts[9].address);
      const expectedTreasuryProfit = BigNumber.from("50000");
      expect(treasuryBalance.sub(treasuryLastBalance)).to.eq(expectedTreasuryProfit);
    }

    it("should revert when send ETH value lower than price", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );

      const accounts = await ethers.getSigners();
      const lowerPrice = utils.parseEther("0.9");
      const buyOrder = market.connect(accounts[1]).createBuyOrder(1, {
        value: lowerPrice
      });

      expect(buyOrder)
        .eventually
        .rejectedWith("Market: Sent ETH value does not match the specified price");
    });

    it("should able to buy order", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );

      const accounts = await ethers.getSigners();
      const block = await ethers.provider.getBlockNumber();
      const lastBalance = await ethers.provider.getBalance(accounts[0].address);
      const currentOrder = await market.orders(1);
  
      await market.connect(accounts[1]).createBuyOrder(1, {
        value: price
      });

      const buyEvents = await market.queryFilter(
        market.filters.OrderBuyCreated(),
        block
      );

      const expectedId = BigNumber.from("1");
      
      const buyLog = market.interface.parseLog(buyEvents[0]);
      expect(buyLog.name).to.eq("OrderBuyCreated");
      expect(buyLog.args.orderId).to.eq(expectedId);
      expect(buyLog.args.tokenId).to.eq(currentOrder.tokenId);
      expect(buyLog.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(buyLog.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(buyLog.args.bidder).to.eq(accounts[1].address);
      expect(buyLog.args.price).to.eq(currentOrder.price);
      expect(buyLog.args.currency).to.eq(currentOrder.currency);

      const finishEvents = await market.queryFilter(
        market.filters.OrderFinished(),
        block
      );

      const expectedMarketPortion = utils.parseEther("0.05");
      const expectedCreatorPortion = BigNumber.from("0");
      const expectedOwnerPortion = utils.parseEther("0.95");

      const finishLog = market.interface.parseLog(finishEvents[0]);
      expect(finishLog.name).to.eq("OrderFinished");
      expect(finishLog.args.orderId).to.eq(expectedId);
      expect(finishLog.args.orderType).to.eq(currentOrder.orderType);
      expect(finishLog.args.tokenId).to.eq(currentOrder.tokenId);
      expect(finishLog.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(finishLog.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(finishLog.args.bidder).to.eq(accounts[1].address);
      expect(finishLog.args.price).to.eq(currentOrder.price);
      expect(finishLog.args.marketPortion).to.eq(expectedMarketPortion);
      expect(finishLog.args.creatorPortion).to.eq(expectedCreatorPortion);
      expect(finishLog.args.ownerPortion).to.eq(expectedOwnerPortion);
      expect(finishLog.args.currency).to.eq(currentOrder.currency);

      const currentBalance = await ethers.provider.getBalance(accounts[0].address);
      const expectedProfit = BigNumber.from("950000000000000000");
      expect(currentBalance.sub(lastBalance)).to.eq(expectedProfit);

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const treasuryBalance = await ethers.provider.getBalance(accounts[9].address);
      const expectedTreasuryBalance = BigNumber.from("10000050000000000000000");
      expect(treasuryBalance).to.eq(expectedTreasuryBalance);
    });

    it("should distribute royalty for ERC2981", async function () {
      await createBuyOrderRoyalty('royalty');
    });

    it("should distribute royalty for RoyaltyV1", async function () {
      await createBuyOrderRoyalty('royaltyV1');
    });

    it("should distribute royalty for RoyaltyV2", async function () {
      await createBuyOrderRoyalty('royaltyV2');
    });

    it("should revert when ERC20 token transfer amount exceeds balance", async function () {
      const price = BigNumber.from("1000000");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        idrt.address
      );

      const accounts = await ethers.getSigners();

      const balance = BigNumber.from("500000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);

      const createBuyOrder = market.connect(accounts[1]).createBuyOrder(1);
      expect(createBuyOrder)
        .eventually
        .rejectedWith("ERC20: transfer amount exceeds balance");
    });

    it("should able to buy with ERC20 token", async function () {
      const price = BigNumber.from("1000000");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        idrt.address
      );

      const accounts = await ethers.getSigners();
      const block = await ethers.provider.getBlockNumber();
      const currentOrder = await market.orders(1);

      const balance = BigNumber.from("2000000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);
      const lastBalance = await idrt.balanceOf(accounts[0].address);
      const treasuryLastBalance = await idrt.balanceOf(accounts[9].address);

      await market.connect(accounts[1]).createBuyOrder(1);

      const buyEvents = await market.queryFilter(
        market.filters.OrderBuyCreated(),
        block
      );

      const expectedId = BigNumber.from("1");
      
      const buyLog = market.interface.parseLog(buyEvents[0]);
      expect(buyLog.name).to.eq("OrderBuyCreated");
      expect(buyLog.args.orderId).to.eq(expectedId);
      expect(buyLog.args.tokenId).to.eq(currentOrder.tokenId);
      expect(buyLog.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(buyLog.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(buyLog.args.bidder).to.eq(accounts[1].address);
      expect(buyLog.args.price).to.eq(currentOrder.price);
      expect(buyLog.args.currency).to.eq(currentOrder.currency);

      const finishEvents = await market.queryFilter(
        market.filters.OrderFinished(),
        block
      );

      const expectedMarketPortion = BigNumber.from("50000");
      const expectedCreatorPortion = BigNumber.from("0");
      const expectedOwnerPortion = BigNumber.from("950000");

      const finishLog = market.interface.parseLog(finishEvents[0]);
      expect(finishLog.name).to.eq("OrderFinished");
      expect(finishLog.args.orderId).to.eq(expectedId);
      expect(finishLog.args.orderType).to.eq(currentOrder.orderType);
      expect(finishLog.args.tokenId).to.eq(currentOrder.tokenId);
      expect(finishLog.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(finishLog.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(finishLog.args.bidder).to.eq(accounts[1].address);
      expect(finishLog.args.price).to.eq(currentOrder.price);
      expect(finishLog.args.marketPortion).to.eq(expectedMarketPortion);
      expect(finishLog.args.creatorPortion).to.eq(expectedCreatorPortion);
      expect(finishLog.args.ownerPortion).to.eq(expectedOwnerPortion);
      expect(finishLog.args.currency).to.eq(currentOrder.currency);

      const currentBalance = await idrt.balanceOf(accounts[0].address);
      const expectedProfit = BigNumber.from("950000");
      expect(currentBalance.sub(lastBalance)).to.eq(expectedProfit);

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const treasuryBalance = await idrt.balanceOf(accounts[9].address);
      const expectedTreasuryProfit = BigNumber.from("50000");
      expect(treasuryBalance.sub(treasuryLastBalance)).to.eq(expectedTreasuryProfit);
    });

    it("should distribute ERC20 royalty for ERC2981", async function () {
      await createBuyOrderERC20Royalty('royalty');
    });

    it("should distribute ERC20 royalty for RoyaltyV1", async function () {
      await createBuyOrderERC20Royalty('royaltyV1');
    });
    it("should distribute ERC20 royalty for RoyaltyV2", async function () {
      await createBuyOrderERC20Royalty('royaltyV2');
    });
  });

  describe("Cancel sell order", async function () {
    let market;

    beforeEach(async function () {
      market = await deploy();

      const accounts = await ethers.getSigners();
      await nfts.test.safeMint(accounts[0].address);

      await nfts.test.setApprovalForAll(
        market.address,
        true
      );
    });

    it("should revert when orderId not exist", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );

      const cancelOrder = market.cancelOrder(2);

      expect(cancelOrder)
        .eventually
        .rejectedWith("Market: The order does not exist");
    });

    it("should revert when not order creator", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );
      
      const accounts = await ethers.getSigners();
      const cancelOrder = market.connect(accounts[1]).cancelOrder(1);

      expect(cancelOrder)
        .eventually
        .rejectedWith("Market: Only can be called by order creator");
    });

    it("should cancel the order", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );

      await market.cancelOrder(1);

      const accounts = await ethers.getSigners();
      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(accounts[0].address);
    });
  });

  describe("Update sell order", async function () {
    let market;

    beforeEach(async function () {
      market = await deploy();

      const accounts = await ethers.getSigners();
      await nfts.test.safeMint(accounts[0].address);

      await nfts.test.setApprovalForAll(
        market.address,
        true
      );
    });

    it("should revert when orderId not exist", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );

      const newPrice = utils.parseEther("2");
      const updateSellOrder = market.updateSellOrder(2, newPrice);

      expect(updateSellOrder)
        .eventually
        .rejectedWith("Market: The order does not exist");
    });

    it("should revert when not order creator", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );
      
      const accounts = await ethers.getSigners();
      const newPrice = utils.parseEther("2");
      const updateSellOrder = market.connect(accounts[1]).updateSellOrder(1, newPrice);

      expect(updateSellOrder)
        .eventually
        .rejectedWith("Market: Only can be called by order creator");
    });

    it("should revert when price is zero", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );
      
      const updateSellOrder = market.updateSellOrder(1, 0);
    
      expect(updateSellOrder)
        .eventually
        .rejectedWith("Market: Price cannot be zero");
    });

    it("should update the order", async function () {
      const price = utils.parseEther("1");
      await market.createSellOrder(
        1,
        nfts.test.address,
        price,
        ethers.constants.AddressZero
      );

      const newPrice = utils.parseEther("2");
      await market.updateSellOrder(1, newPrice);

      const currentOrder = await market.orders(1);
      expect(currentOrder.price).to.eq(newPrice);
    });
  });

  describe("Create auction order", async function () {
    let market;

    beforeEach(async function () {
      market = await deploy();

      const accounts = await ethers.getSigners();
      await nfts.test.safeMint(accounts[0].address);

      await nfts.test.setApprovalForAll(
        market.address,
        true
      );
    });

    it("should revert for unsupported ERC721", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      const auctionOrder = market.createAuctionOrder(
        1,
        nfts.bad.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );
      
      expect(auctionOrder)
        .eventually
        .rejectedWith("Market: tokenContract does not support ERC721 interface");
    });

    it("should revert for non owner or approved", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      const accounts = await ethers.getSigners();
      const auctionOrder = market.connect(accounts[1]).createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );
    
      expect(auctionOrder)
        .eventually
        .rejectedWith("Market: Caller must be approved or owner for tokenId");
    });

    it("should revert when tokenId does not exist", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      const auctionOrder = market.createAuctionOrder(
        100,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );
    
      expect(auctionOrder)
        .eventually
        .rejectedWith("ERC721: owner query for nonexistent token");
    });

    it("should revert when reservePrice is zero", async function () {
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      const auctionOrder = market.createAuctionOrder(
        1,
        nfts.test.address,
        0,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );
    
      expect(auctionOrder)
        .eventually
        .rejectedWith("Market: reservePrice cannot be zero");
    });

    it("should revert when duration is zero", async function () {
      const reservePrice = utils.parseEther("1");
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      const auctionOrder = market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        0,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );
    
      expect(auctionOrder)
        .eventually
        .rejectedWith("Market: Duration cannot be zero");
    });

    it("should create an auction order", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      const block = await ethers.provider.getBlockNumber();
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const events = await market.queryFilter(
        market.filters.OrderCreated(),
        block
      );
      expect(events.length).eq(1);

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");
      const log = market.interface.parseLog(events[0]);
      expect(log.name).to.eq("OrderCreated");
      expect(log.args.orderId).to.eq(expectedId);
      expect(log.args.orderType).to.eq(currentOrder.orderType);
      expect(log.args.tokenId).to.eq(currentOrder.tokenId);
      expect(log.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(log.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.reservePrice).to.eq(currentOrder.reservePrice);
      expect(log.args.duration).to.eq(currentOrder.duration);
      expect(log.args.extensionDuration).to.eq(currentOrder.extensionDuration);
      expect(log.args.currency).to.eq(currentOrder.currency);

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });

    it("should create an auction order with default extensionDuration and minBidIncrement", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const block = await ethers.provider.getBlockNumber();
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        0,
        0,
        ethers.constants.AddressZero
      );

      const events = await market.queryFilter(
        market.filters.OrderCreated(),
        block
      );
      expect(events.length).eq(1);

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");
      const log = market.interface.parseLog(events[0]);
      expect(log.name).to.eq("OrderCreated");
      expect(log.args.orderId).to.eq(expectedId);
      expect(log.args.orderType).to.eq(currentOrder.orderType);
      expect(log.args.tokenId).to.eq(currentOrder.tokenId);
      expect(log.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(log.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.reservePrice).to.eq(currentOrder.reservePrice);
      expect(log.args.duration).to.eq(currentOrder.duration);
      expect(log.args.extensionDuration).to.eq(currentOrder.extensionDuration);
      expect(log.args.currency).to.eq(currentOrder.currency);

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });

    it("should create an auction order with ERC20", async function () {
      const reservePrice = BigNumber.from("1000000");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      const block = await ethers.provider.getBlockNumber();
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        idrt.address
      );

      const events = await market.queryFilter(
        market.filters.OrderCreated(),
        block
      );
      expect(events.length).eq(1);

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");
      const log = market.interface.parseLog(events[0]);
      expect(log.name).to.eq("OrderCreated");
      expect(log.args.orderId).to.eq(expectedId);
      expect(log.args.orderType).to.eq(currentOrder.orderType);
      expect(log.args.tokenId).to.eq(currentOrder.tokenId);
      expect(log.args.tokenContract).to.eq(currentOrder.tokenContract);
      expect(log.args.tokenOwner).to.eq(currentOrder.tokenOwner);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.reservePrice).to.eq(currentOrder.reservePrice);
      expect(log.args.duration).to.eq(currentOrder.duration);
      expect(log.args.extensionDuration).to.eq(currentOrder.extensionDuration);
      expect(log.args.currency).to.eq(currentOrder.currency);

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });
  });

  describe("Create bid auction order", async function () {
    let market;

    beforeEach(async function () {
      market = await deploy();

      const accounts = await ethers.getSigners();
      await nfts.test.safeMint(accounts[0].address);

      await nfts.test.setApprovalForAll(
        market.address,
        true
      );
    });
    
    it("should revert when send ETH value lower than price and reservePrice", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const lowerPrice = utils.parseEther("0.1");
      const bidOrder = market.createBidOrder(1, reservePrice, { value: lowerPrice });
      
      expect(bidOrder)
        .eventually
        .rejectedWith("Market: The minimum bid must match the reserve price");
    });

    it("should revert when auction is over", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 1;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      await market.createBidOrder(1, reservePrice, { value: reservePrice });
      
      const accounts = await ethers.getSigners();
      const secondBidPrice = utils.parseEther("1.1");
      const bidOrder = market.connect(accounts[1]).createBidOrder(
        1,
        secondBidPrice,
        { value: secondBidPrice }
      );

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: Auction is over");
    });

    it("should revert when bidder already at highest bid", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      await market.createBidOrder(1, reservePrice, { value: reservePrice });
      
      const secondBidPrice = utils.parseEther("1.1");
      const bidOrder = market.createBidOrder(
        1,
        secondBidPrice,
        { value: secondBidPrice }
      );

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: You already at highest bid");
    });

    it("should revert when send ETH value lower than highest bid", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      await market.createBidOrder(1, reservePrice, { value: reservePrice });
      
      const accounts = await ethers.getSigners();
      const secondBidPrice = utils.parseEther("0.9");
      const bidOrder = market.connect(accounts[1]).createBidOrder(
        1,
        secondBidPrice,
        { value: secondBidPrice }
      );

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: Bid price to low");
    });

    it("should be able to bid for first time", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const block = await ethers.provider.getBlockNumber();
      await market.createBidOrder(1, reservePrice, { value: reservePrice });

      const events = await market.queryFilter(
        market.filters.OrderBidCreated(),
        block
      );
      expect(events.length).eq(1);

      const currentOrder = await market.orders(1);
      const log = market.interface.parseLog(events[0]);
      expect(log.name).to.eq("OrderBidCreated");
      expect(log.args.bidder).to.eq(currentOrder.bidder);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.extended).to.eq(false);
    });

    it("should be able to bid for second time", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const block = await ethers.provider.getBlockNumber();
      await market.createBidOrder(1, reservePrice, { value: reservePrice });

      const accounts = await ethers.getSigners();
      const secondBidPrice = utils.parseEther("1.1");
      await market.connect(accounts[1]).createBidOrder(1, secondBidPrice, { value: secondBidPrice });

      const events = await market.queryFilter(
        market.filters.OrderBidCreated(),
        block
      );
      expect(events.length).eq(2);

      const currentOrder = await market.orders(1);
      const log = market.interface.parseLog(events[1]);
      expect(log.name).to.eq("OrderBidCreated");
      expect(log.args.bidder).to.eq(currentOrder.bidder);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.extended).to.eq(false);
    });

    it("should be able to extend the duration", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 15;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const block = await ethers.provider.getBlockNumber();
      await market.createBidOrder(1, reservePrice, { value: reservePrice });

      const accounts = await ethers.getSigners();
      const secondBidPrice = utils.parseEther("1.1");
      await market.connect(accounts[1]).createBidOrder(1, secondBidPrice, { value: secondBidPrice });

      const events = await market.queryFilter(
        market.filters.OrderBidCreated(),
        block
      );
      expect(events.length).eq(2);

      const currentOrder = await market.orders(1);
      const log = market.interface.parseLog(events[1]);
      expect(log.name).to.eq("OrderBidCreated");
      expect(log.args.bidder).to.eq(currentOrder.bidder);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.extended).to.eq(true);
    });

    it("should be able refund to first bidder", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const block = await ethers.provider.getBlockNumber();
      const accounts = await ethers.getSigners();
      await market.connect(accounts[1]).createBidOrder(1, reservePrice, { value: reservePrice });

      const lastBalance = await ethers.provider.getBalance(accounts[1].address);

      const secondBidPrice = utils.parseEther("1.1");
      await market.connect(accounts[2]).createBidOrder(1, secondBidPrice, { value: secondBidPrice });

      const currentBalance = await ethers.provider.getBalance(accounts[1].address);
      const expectedRefund = utils.parseEther("1");
      expect(currentBalance.sub(lastBalance)).to.eq(expectedRefund);
    });

    it("should revert when ERC20 token exceeds balance", async function () {
      const reservePrice = 1000000;
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        idrt.address
      );

      const accounts = await ethers.getSigners();
      const balance = BigNumber.from("500000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);

      const bidOrder = market.connect(accounts[1]).createBidOrder(1, reservePrice);
      
      expect(bidOrder)
        .eventually
        .rejectedWith("ERC20: transfer amount exceeds balance");
    });

    it("should revert when ERC20 value lower than reservePrice", async function () {
      const reservePrice = 1000000;
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        idrt.address
      );

      const lowerPrice = 500000;
      const bidOrder = market.createBidOrder(1, lowerPrice);
      
      expect(bidOrder)
        .eventually
        .rejectedWith("Market: The minimum bid must match the reserve price");
    });

    it("should revert when ERC20 value lower than highest bid", async function () {
      const reservePrice = 1000000;
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        idrt.address
      );

      const accounts = await ethers.getSigners();
      const balance = BigNumber.from("2000000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);
      await idrt.mint(accounts[2].address, balance);
      await idrt.connect(accounts[2]).approve(market.address, balance);

      const block = await ethers.provider.getBlockNumber();
      await market.connect(accounts[1]).createBidOrder(1, reservePrice);

      const secondBidPrice = 1000000;
      const bidOrder = market.connect(accounts[2]).createBidOrder(1, secondBidPrice);
      
      expect(bidOrder)
        .eventually
        .rejectedWith("Market: Bid price to low");
    });

    it("should be able to bid with ERC20 for first time", async function () {
      const reservePrice = 1000000;
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        idrt.address
      );

      const accounts = await ethers.getSigners();
      const balance = BigNumber.from("2000000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);

      const block = await ethers.provider.getBlockNumber();
      await market.connect(accounts[1]).createBidOrder(1, reservePrice);

      const events = await market.queryFilter(
        market.filters.OrderBidCreated(),
        block
      );
      expect(events.length).eq(1);

      const currentOrder = await market.orders(1);
      const log = market.interface.parseLog(events[0]);
      expect(log.name).to.eq("OrderBidCreated");
      expect(log.args.bidder).to.eq(currentOrder.bidder);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.extended).to.eq(false);
    });

    it("should be able to bid with ERC20 for second time", async function () {
      const reservePrice = 1000000;
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        idrt.address
      );

      const accounts = await ethers.getSigners();
      const balance = BigNumber.from("2000000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);
      await idrt.mint(accounts[2].address, balance);
      await idrt.connect(accounts[2]).approve(market.address, balance);

      const block = await ethers.provider.getBlockNumber();
      await market.connect(accounts[1]).createBidOrder(1, reservePrice);

      const secondBidPrice = 1100000;
      await market.connect(accounts[2]).createBidOrder(1, secondBidPrice);

      const events = await market.queryFilter(
        market.filters.OrderBidCreated(),
        block
      );
      expect(events.length).eq(2);

      const currentOrder = await market.orders(1);
      const log = market.interface.parseLog(events[1]);
      expect(log.name).to.eq("OrderBidCreated");
      expect(log.args.bidder).to.eq(currentOrder.bidder);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.extended).to.eq(false);
    });

    it("should be able to bid with ERC20 and extend the duration", async function () {
      const reservePrice = 1000000;
      const duration = 60 * 15;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        idrt.address
      );

      const accounts = await ethers.getSigners();
      const balance = BigNumber.from("2000000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);
      await idrt.mint(accounts[2].address, balance);
      await idrt.connect(accounts[2]).approve(market.address, balance);

      const block = await ethers.provider.getBlockNumber();
      await market.connect(accounts[1]).createBidOrder(1, reservePrice);

      const secondBidPrice = 1100000;
      await market.connect(accounts[2]).createBidOrder(1, secondBidPrice);

      const events = await market.queryFilter(
        market.filters.OrderBidCreated(),
        block
      );
      expect(events.length).eq(2);

      const currentOrder = await market.orders(1);
      const log = market.interface.parseLog(events[1]);
      expect(log.name).to.eq("OrderBidCreated");
      expect(log.args.bidder).to.eq(currentOrder.bidder);
      expect(log.args.price).to.eq(currentOrder.price);
      expect(log.args.extended).to.eq(true);
    });

    it("should be able refund ERC20 to first bidder", async function () {
      const reservePrice = 1000000;
      const duration = 60 * 15;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        idrt.address
      );

      const accounts = await ethers.getSigners();
      const balance = BigNumber.from("2000000");
      await idrt.mint(accounts[1].address, balance);
      await idrt.connect(accounts[1]).approve(market.address, balance);
      await idrt.mint(accounts[2].address, balance);
      await idrt.connect(accounts[2]).approve(market.address, balance);

      const block = await ethers.provider.getBlockNumber();
      await market.connect(accounts[1]).createBidOrder(1, reservePrice);

      const lastBalance = await idrt.balanceOf(accounts[1].address);

      const secondBidPrice = 1100000;
      await market.connect(accounts[2]).createBidOrder(1, secondBidPrice);

      const currentBalance = await idrt.balanceOf(accounts[1].address);
      const expectedRefund = BigNumber.from("1000000");
      expect(currentBalance.sub(lastBalance)).to.eq(expectedRefund);
    });
  });

  describe("Cancel auction order", async function () {
    let market;

    beforeEach(async function () {
      market = await deploy();

      const accounts = await ethers.getSigners();
      await nfts.test.safeMint(accounts[0].address);

      await nfts.test.setApprovalForAll(
        market.address,
        true
      );
    });

    it("should revert when orderId not exist", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const cancelOrder = market.cancelOrder(2);

      expect(cancelOrder)
        .eventually
        .rejectedWith("Market: The order does not exist");
    });

    it("should revert when not order creator", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );
      
      const accounts = await ethers.getSigners();
      const cancelOrder = market.connect(accounts[1]).cancelOrder(1);

      expect(cancelOrder)
        .eventually
        .rejectedWith("Market: Only can be called by order creator");
    });

    it("should cancel the order", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      await market.cancelOrder(1);

      const accounts = await ethers.getSigners();
      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(accounts[0].address);
    });

    it("should revert when auction in progress", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const accounts = await ethers.getSigners();
      await market.connect(accounts[1]).createBidOrder(1, reservePrice, { value: reservePrice });

      const cancelOrder = market.cancelOrder(1);

      expect(cancelOrder)
        .eventually
        .rejectedWith("Market: Auction in progress");
    });
  });

  describe("Update auction order", async function () {
    let market;

    beforeEach(async function () {
      market = await deploy();

      const accounts = await ethers.getSigners();
      await nfts.test.safeMint(accounts[0].address);

      await nfts.test.setApprovalForAll(
        market.address,
        true
      );
    });

    it("should revert when orderId not exist", async function () {
      const reservePrice = utils.parseEther("1");
      const updateOrder = market.updateAuctionOrder(
        1,
        reservePrice
      );

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: The order does not exist");
    });

    it("should revert when not order creator", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const accounts = await ethers.getSigners();
      const updateOrder = market.connect(accounts[1]).updateAuctionOrder(
        1,
        reservePrice
      );

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: Only can be called by order creator");
    });

    it("should revert when auction in progress", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      await market.createBidOrder(1, reservePrice, { value: reservePrice });

      const updateOrder = market.updateAuctionOrder(
        1,
        reservePrice
      );

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: Auction in progress");
    });

    it("should revert when auction in progress", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const updateOrder = market.updateAuctionOrder(
        1,
        0
      );

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: reservePrice cannot be zero");
    });

    it("should update the order", async function () {
      const reservePrice = utils.parseEther("1");
      const duration = 60 * 60 * 24;
      const extensionDuration = 60 * 15;
      const minBidIncrement = 100;
      await market.createAuctionOrder(
        1,
        nfts.test.address,
        reservePrice,
        duration,
        extensionDuration,
        minBidIncrement,
        ethers.constants.AddressZero
      );

      const block = await ethers.provider.getBlockNumber();
      const newReservePrice = utils.parseEther("2");
      await market.updateAuctionOrder(
        1,
        newReservePrice
      );

      const events = await market.queryFilter(
        market.filters.OrderUpdated(),
        block
      );
      expect(events.length).eq(1);

      const currentOrder = await market.orders(1);
      const log = market.interface.parseLog(events[0]);
      expect(log.name).to.eq("OrderUpdated");
      expect(log.args.reservePrice).to.eq(currentOrder.reservePrice);

      expect(currentOrder.reservePrice).to.eq(newReservePrice);
    });
  });
});
