const chai = require("chai");
const asPromised = require("chai-as-promised");
const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("ethers");

const expect = chai.expect;
chai.use(asPromised);

describe("Market", function () {
  let accounts;
  let market;
  let weth;
  let idrt;
  let nfts = {}

  beforeEach(async function () {
    accounts = await ethers.getSigners();

    const WETH = await ethers.getContractFactory("WETH9");
    weth = await WETH.deploy();
    const IDRT = await ethers.getContractFactory("IDRT");
    idrt = await IDRT.deploy();

    const ERC721Test = await ethers.getContractFactory("ERC721Test");
    const ERC721Bad = await ethers.getContractFactory("ERC721Bad");
    const ERC721Royalty = await ethers.getContractFactory("ERC721Royalty");
    const ERC721RoyaltyV1 = await ethers.getContractFactory("ERC721RoyaltyV1");
    const ERC721RoyaltyV2 = await ethers.getContractFactory("ERC721RoyaltyV2");
    nfts.test = await ERC721Test.deploy();
    nfts.bad = await ERC721Bad.deploy();
    nfts.royalty = await ERC721Royalty.deploy();
    nfts.royaltyV1 = await ERC721RoyaltyV1.deploy();
    nfts.royaltyV2 = await ERC721RoyaltyV2.deploy();

    market = await deploy();

    await nfts.test.safeMint(accounts[0].address);
    await nfts.royalty.safeMint(accounts[0].address, 500);
    await nfts.royaltyV1.safeMint(accounts[0].address, 500);
    await nfts.royaltyV2.safeMint(accounts[0].address, 500);

    await nfts.test.setApprovalForAll(market.address, true);
    await nfts.royalty.setApprovalForAll(market.address, true);
    await nfts.royaltyV1.setApprovalForAll(market.address, true);
    await nfts.royaltyV2.setApprovalForAll(market.address, true);
  });

  async function deploy() {
    const Market = await ethers.getContractFactory("Market");
    const market = await upgrades.deployProxy(Market, [
      weth.address
    ]);
    await market.deployed();

    await market.setMarketTreasury(accounts[9].address);
    await market.setMarketFee(500);

    return market;
  }

  async function mintAndApproveERC20({
    balance = 2000000,
    account = accounts[1],
    market,
    currency
  }) {
    await currency.mint(account.address, balance);
    await currency.connect(account).approve(market.address, balance);
  }

  async function createSellOrder({
    account = accounts[0],
    currency = ethers.constants.AddressZero,
    tokenId,
    tokenContract,
    price
  }) {
    return market.connect(account)
      .createSellOrder(tokenId, tokenContract, price, currency);
  }

  async function updateSellOrder({
    account = accounts[0],
    orderId,
    price
  }) {
    return market.connect(account).updateSellOrder(orderId, price);
  }

  async function createBuyOrder({
    account = accounts[0],
    value = 0,
    orderId
  }) {
    return market.connect(account).createBuyOrder(orderId, { value: value });
  }

  async function createAuctionOrder({
    account = accounts[0],
    currency = ethers.constants.AddressZero,
    tokenId,
    tokenContract,
    reservePrice,
    duration = 60 * 60 * 24,
    extensionDuration = 60 * 15,
    minBidIncrement = 100
  }) {
    return market.connect(account).createAuctionOrder(
      tokenId,
      tokenContract,
      reservePrice,
      duration,
      extensionDuration,
      minBidIncrement,
      currency
    );
  }

  async function updateAuctionOrder({
    account = accounts[0],
    orderId,
    reservePrice
  }) {
    return market.connect(account).updateAuctionOrder(orderId, reservePrice);
  }

  async function createBidOrder({
    account = accounts[0],
    value = 0,
    orderId,
    price
  }) {
    return market.connect(account).createBidOrder(orderId, price, { value: value });
  }

  async function finalizeAuctionOrder({
    account = accounts[0],
    orderId
  }) {
    return market.connect(account).finalizeAuctionOrder(orderId);
  }

  async function cancelOrder({
    account = accounts[0],
    orderId
  }) {
    return market.connect(account).cancelOrder(orderId);
  }

  async function expectEvents({ block, event, length = 1, index = 0, args = {} }) {
    const events = await market.queryFilter(market.filters[event](), block);
    expect(events.length).eq(length);

    const log = market.interface.parseLog(events[index]);
    expect(log.name).to.eq(event);

    for (const [key, value] of Object.entries(args)) {
      expect(log.args[key]).to.eq(value);
    }
  }

  async function expectBalances({ accounts = [] }) {
    accounts.forEach(async function (account) {
      const currentBalance = await ethers.provider.getBalance(account.address);
      expect(currentBalance.sub(account.balance)).to.eq(account.profit);
    });
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
    it("should revert for unsupported ERC721", async function () {
      const price = ethers.utils.parseEther("1");
      const sellOrder = createSellOrder({
        tokenId: 1,
        tokenContract: nfts.bad.address,
        price: price
      });

      expect(sellOrder)
        .eventually
        .rejectedWith("Market: tokenContract does not support ERC721 interface");
    });

    it("should revert for non owner or approved", async function () {
      const price = ethers.utils.parseEther("1");
      const sellOrder = createSellOrder({
        account: accounts[1],
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      expect(sellOrder)
        .eventually
        .rejectedWith("Market: Caller must be approved or owner for tokenId");
    });

    it("should revert when tokenId does not exist", async function () {
      const price = ethers.utils.parseEther("1");
      const sellOrder = createSellOrder({
        tokenId: 100,
        tokenContract: nfts.test.address,
        price: price
      });

      expect(sellOrder)
        .eventually
        .rejectedWith("ERC721: owner query for nonexistent token");
    });

    it("should revert when price is zero", async function () {
      const sellOrder = createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: 0
      });

      expect(sellOrder)
        .eventually
        .rejectedWith("Market: Price cannot be zero");
    });

    it("should create a sell order", async function () {
      const price = ethers.utils.parseEther("1");
      const block = await ethers.provider.getBlockNumber();

      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");

      await expectEvents({
        block: block,
        event: "OrderCreated",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          orderType: currentOrder.orderType,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          price: currentOrder.price,
          reservePrice: currentOrder.reservePrice,
          duration: currentOrder.duration,
          extensionDuration: currentOrder.extensionDuration,
          currency: currentOrder.currency
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });

    it("should create a sell order with ERC20", async function () {
      const price = BigNumber.from("1000000");
      const block = await ethers.provider.getBlockNumber();

      await createSellOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");

      await expectEvents({
        block: block,
        event: "OrderCreated",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          orderType: currentOrder.orderType,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          price: currentOrder.price,
          reservePrice: currentOrder.reservePrice,
          duration: currentOrder.duration,
          extensionDuration: currentOrder.extensionDuration,
          currency: currentOrder.currency
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });
  });

  describe("Create buy order", async function () {
    async function createBuyOrderRoyalty(royaltySchema) {
      await nfts[royaltySchema]["safeTransferFrom(address,address,uint256)"](
        accounts[0].address,
        accounts[2].address,
        1
      );
      await nfts[royaltySchema].connect(accounts[2]).setApprovalForAll(
        market.address,
        true
      );

      const price = ethers.utils.parseEther("1");

      await createSellOrder({
        account: accounts[2],
        tokenId: 1,
        tokenContract: nfts[royaltySchema].address,
        price: price
      });

      const lastBalance = await ethers.provider.getBalance(accounts[2].address);
      const creatorLastBalance = await ethers.provider.getBalance(accounts[0].address);
      const treasuryLastBalance = await ethers.provider.getBalance(accounts[9].address);

      await createBuyOrder({
        account: accounts[1],
        value: price,
        orderId: 1
      });

      const tokenOwner = await nfts[royaltySchema].ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const expectedProfit = BigNumber.from("900000000000000000");
      const expectedCreatorProfit = BigNumber.from("50000000000000000");
      const expectedTreasuryProfit = BigNumber.from("50000000000000000");

      await expectBalances([
        {
          address: accounts[2].address,
          balance: lastBalance,
          profit: expectedProfit
        },
        {
          address: accounts[0].address,
          balance: creatorLastBalance,
          profit: expectedCreatorProfit
        },
        {
          address: accounts[9].address,
          balance: treasuryLastBalance,
          profit: expectedTreasuryProfit
        },
      ]);
    }

    async function createBuyOrderERC20Royalty(royaltySchema) {
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

      await createSellOrder({
        account: accounts[2],
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts[royaltySchema].address,
        price: price
      });

      await mintAndApproveERC20({
        market: market,
        currency: idrt
      });

      const lastBalance = await idrt.balanceOf(accounts[2].address);
      const creatorLastBalance = await idrt.balanceOf(accounts[0].address);
      const treasuryLastBalance = await idrt.balanceOf(accounts[9].address);

      await createBuyOrder({
        account: accounts[1],
        orderId: 1
      });

      const tokenOwner = await nfts[royaltySchema].ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const expectedProfit = BigNumber.from("900000");
      const expectedCreatorProfit = BigNumber.from("50000");
      const expectedTreasuryProfit = BigNumber.from("50000");

      await expectBalances([
        {
          address: accounts[2].address,
          balance: lastBalance,
          profit: expectedProfit
        },
        {
          address: accounts[0].address,
          balance: creatorLastBalance,
          profit: expectedCreatorProfit
        },
        {
          address: accounts[9].address,
          balance: treasuryLastBalance,
          profit: expectedTreasuryProfit
        },
      ]);
    }

    it("should revert when send ETH value lower than price", async function () {
      const price = ethers.utils.parseEther("1");

      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const lowerPrice = ethers.utils.parseEther("0.9");
      const buyOrder = createBuyOrder({
        account: accounts[1],
        orderId: 1,
        value: lowerPrice
      })

      expect(buyOrder)
        .eventually
        .rejectedWith("Market: Sent ETH value does not match the specified price");
    });

    it("should able to buy order", async function () {
      const price = ethers.utils.parseEther("1");

      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const block = await ethers.provider.getBlockNumber();
      const lastBalance = await ethers.provider.getBalance(accounts[0].address);
      const treasuryLastBalance = await ethers.provider.getBalance(accounts[9].address);
      const currentOrder = await market.orders(1);

      await createBuyOrder({
        account: accounts[1],
        orderId: 1,
        value: price
      });

      const expectedId = BigNumber.from("1");

      await expectEvents({
        block: block,
        event: "OrderBuyCreated",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          bidder: accounts[1].address,
          price: currentOrder.price,
          currency: currentOrder.currency
        }
      });

      const expectedMarketPortion = ethers.utils.parseEther("0.05");
      const expectedCreatorPortion = BigNumber.from("0");
      const expectedOwnerPortion = ethers.utils.parseEther("0.95");

      await expectEvents({
        block: block,
        event: "OrderFinished",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          orderType: currentOrder.orderType,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          bidder: accounts[1].address,
          price: currentOrder.price,
          marketPortion: expectedMarketPortion,
          creatorPortion: expectedCreatorPortion,
          ownerPortion: expectedOwnerPortion,
          currency: currentOrder.currency
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const expectedProfit = BigNumber.from("950000000000000000");
      const expectedTreasuryProfit = BigNumber.from("50000000000000000");

      await expectBalances([
        {
          address: accounts[2].address,
          balance: lastBalance,
          profit: expectedProfit
        },
        {
          address: accounts[9].address,
          balance: treasuryLastBalance,
          profit: expectedTreasuryProfit
        },
      ]);
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

      await createSellOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      await mintAndApproveERC20({
        market: market,
        currency: idrt,
        balance: 500000
      });

      const buyOrder = createBuyOrder({ account: accounts[1], orderId: 1 });
      expect(buyOrder)
        .eventually
        .rejectedWith("ERC20: transfer amount exceeds balance");
    });

    it("should able to buy with ERC20 token", async function () {
      const price = BigNumber.from("1000000");

      await createSellOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const block = await ethers.provider.getBlockNumber();
      const currentOrder = await market.orders(1);

      await mintAndApproveERC20({
        market: market,
        currency: idrt
      });

      const lastBalance = await idrt.balanceOf(accounts[0].address);
      const treasuryLastBalance = await idrt.balanceOf(accounts[9].address);

      await createBuyOrder({
        account: accounts[1],
        orderId: 1
      })

      const expectedId = BigNumber.from("1");

      await expectEvents({
        block: block,
        event: "OrderBuyCreated",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          bidder: accounts[1].address,
          price: currentOrder.price,
          currency: currentOrder.currency
        }
      });

      const expectedMarketPortion = BigNumber.from("50000");
      const expectedCreatorPortion = BigNumber.from("0");
      const expectedOwnerPortion = BigNumber.from("950000");

      await expectEvents({
        block: block,
        event: "OrderFinished",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          orderType: currentOrder.orderType,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          bidder: accounts[1].address,
          price: currentOrder.price,
          marketPortion: expectedMarketPortion,
          creatorPortion: expectedCreatorPortion,
          ownerPortion: expectedOwnerPortion,
          currency: currentOrder.currency
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const expectedProfit = BigNumber.from("950000");
      const expectedTreasuryProfit = BigNumber.from("50000");

      await expectBalances([
        {
          address: accounts[2].address,
          balance: lastBalance,
          profit: expectedProfit
        },
        {
          address: accounts[9].address,
          balance: treasuryLastBalance,
          profit: expectedTreasuryProfit
        },
      ]);
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
    it("should revert when orderId not exist", async function () {
      const price = ethers.utils.parseEther("1");
      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const cancel = cancelOrder({ orderId: 2 });

      expect(cancel)
        .eventually
        .rejectedWith("Market: The order does not exist");
    });

    it("should revert when not order creator", async function () {
      const price = ethers.utils.parseEther("1");
      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const cancel = cancelOrder({ account: accounts[1], orderId: 1 });

      expect(cancel)
        .eventually
        .rejectedWith("Market: Only can be called by order creator");
    });

    it("should cancel the order", async function () {
      const price = ethers.utils.parseEther("1");
      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      })

      const block = await ethers.provider.getBlockNumber();
      const currentOrder = await market.orders(1);
      await cancelOrder({ orderId: 1 });

      const expectedId = BigNumber.from("1");
      await expectEvents({
        block: block,
        event: "OrderCanceled",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(accounts[0].address);
    });
  });

  describe("Update sell order", async function () {
    it("should revert when orderId not exist", async function () {
      const price = ethers.utils.parseEther("1");
      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const newPrice = ethers.utils.parseEther("2");
      const updateOrder = updateSellOrder({ orderId: 2, price: newPrice });

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: The order does not exist");
    });

    it("should revert when not order creator", async function () {
      const price = ethers.utils.parseEther("1");
      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const newPrice = ethers.utils.parseEther("2");
      const updateOrder = updateSellOrder({
        account: accounts[1],
        orderId: 1,
        price: newPrice
      });

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: Only can be called by order creator");
    });

    it("should revert when price is zero", async function () {
      const price = ethers.utils.parseEther("1");
      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const updateOrder = updateSellOrder({ orderId: 1, price: 0 });

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: Price cannot be zero");
    });

    it("should update the order", async function () {
      const price = ethers.utils.parseEther("1");
      await createSellOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        price: price
      });

      const newPrice = ethers.utils.parseEther("2");
      await updateSellOrder({ orderId: 1, price: newPrice });

      const currentOrder = await market.orders(1);
      expect(currentOrder.price).to.eq(newPrice);
    });
  });

  describe("Create auction order", async function () {
    it("should revert for unsupported ERC721", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      const auctionOrder = createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.bad.address,
        reservePrice: reservePrice
      });

      expect(auctionOrder)
        .eventually
        .rejectedWith("Market: tokenContract does not support ERC721 interface");
    });

    it("should revert for non owner or approved", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      const auctionOrder = createAuctionOrder({
        account: accounts[1],
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      expect(auctionOrder)
        .eventually
        .rejectedWith("Market: Caller must be approved or owner for tokenId");
    });

    it("should revert when tokenId does not exist", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      const auctionOrder = createAuctionOrder({
        tokenId: 100,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      expect(auctionOrder)
        .eventually
        .rejectedWith("ERC721: owner query for nonexistent token");
    });

    it("should revert when reservePrice is zero", async function () {
      const auctionOrder = createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: 0
      });

      expect(auctionOrder)
        .eventually
        .rejectedWith("Market: reservePrice cannot be zero");
    });

    it("should revert when duration is zero", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      const auctionOrder = createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
        duration: 0
      });

      expect(auctionOrder)
        .eventually
        .rejectedWith("Market: Duration cannot be zero");
    });

    it("should create an auction order", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      const block = await ethers.provider.getBlockNumber();

      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");

      await expectEvents({
        block: block,
        event: "OrderCreated",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          orderType: currentOrder.orderType,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          price: currentOrder.price,
          reservePrice: currentOrder.reservePrice,
          duration: currentOrder.duration,
          extensionDuration: currentOrder.extensionDuration,
          minBidIncrement: currentOrder.minBidIncrement,
          currency: currentOrder.currency
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });

    it("should create an auction order with default extensionDuration and minBidIncrement", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      const block = await ethers.provider.getBlockNumber();

      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
        extensionDuration: 0,
        minBidIncrement: 0
      });

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");
      const expectedExtensionduration = BigNumber.from("900");
      const expectedMinBidIncrement = BigNumber.from("100");

      await expectEvents({
        block: block,
        event: "OrderCreated",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          orderType: currentOrder.orderType,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          price: currentOrder.price,
          reservePrice: currentOrder.reservePrice,
          duration: currentOrder.duration,
          extensionDuration: expectedExtensionduration,
          minBidIncrement: expectedMinBidIncrement,
          currency: currentOrder.currency
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });

    it("should create an auction order with ERC20", async function () {
      const reservePrice = BigNumber.from("1000000");
      const block = await ethers.provider.getBlockNumber();

      await createAuctionOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      const currentOrder = await market.orders(1);
      const expectedId = BigNumber.from("1");

      await expectEvents({
        block: block,
        event: "OrderCreated",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          orderType: currentOrder.orderType,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          price: currentOrder.price,
          reservePrice: currentOrder.reservePrice,
          duration: currentOrder.duration,
          extensionDuration: currentOrder.extensionDuration,
          minBidIncrement: currentOrder.minBidIncrement,
          currency: currentOrder.currency
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(market.address);
    });
  });

  describe("Create bid auction order", async function () {
    it("should revert when send ETH value lower than price and reservePrice", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      const lowerPrice = ethers.utils.parseEther("0.1");
      const bidOrder = createBidOrder({ orderId: 1, price: reservePrice, value: lowerPrice });

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: The minimum bid must match the reserve price");
    });

    it("should revert when auction is over", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
        duration: 1
      });

      await createBidOrder({
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const secondBidPrice = ethers.utils.parseEther("1.1");
      const bidOrder = createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: Auction is over");
    });

    it("should revert when bidder already at highest bid", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      await createBidOrder({
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const secondBidPrice = ethers.utils.parseEther("1.1");
      const bidOrder = createBidOrder({
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: You already at highest bid");
    });

    it("should revert when send ETH value lower than highest bid", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      await createBidOrder({
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const secondBidPrice = ethers.utils.parseEther("0.9");
      const bidOrder = createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: Bid price to low");
    });

    it("should be able to bid for first time", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      const block = await ethers.provider.getBlockNumber();

      await createBidOrder({
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const currentOrder = await market.orders(1);

      await expectEvents({
        block: block,
        event: "OrderBidCreated",
        length: 1,
        index: 0,
        args: {
          bidder: currentOrder.bidder,
          price: currentOrder.price,
          extended: false
        }
      });
    });

    it("should be able to bid for second time", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      const block = await ethers.provider.getBlockNumber();

      await createBidOrder({
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });


      const secondBidPrice = ethers.utils.parseEther("1.1");
      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      const currentOrder = await market.orders(1);
      await expectEvents({
        block: block,
        event: "OrderBidCreated",
        length: 2,
        index: 1,
        args: {
          bidder: currentOrder.bidder,
          price: currentOrder.price,
          extended: false
        }
      });
    });

    it("should be able to extend the duration", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      const duration = 60 * 15;
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
        duration: duration
      });

      const block = await ethers.provider.getBlockNumber();

      await createBidOrder({
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });


      const secondBidPrice = ethers.utils.parseEther("1.1");
      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      const currentOrder = await market.orders(1);
      await expectEvents({
        block: block,
        event: "OrderBidCreated",
        length: 2,
        index: 1,
        args: {
          bidder: currentOrder.bidder,
          price: currentOrder.price,
          extended: true
        }
      });
    });

    it("should be able refund to first bidder", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      const lastBalance = await ethers.provider.getBalance(accounts[1].address);

      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const secondBidPrice = ethers.utils.parseEther("1.1");
      await createBidOrder({
        account: accounts[2],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      const expectedRefund = ethers.utils.parseEther("1");
      await expectBalances([
        {
          address: accounts[1].address,
          balance: lastBalance,
          profit: expectedRefund
        }
      ])
    });

    it("should revert when ERC20 token exceeds balance", async function () {
      const reservePrice = 1000000;
      await createAuctionOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      await mintAndApproveERC20({
        balance: 500000,
        account: accounts[1],
        market: market,
        currency: idrt
      });

      const bidOrder = createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice
      });

      expect(bidOrder)
        .eventually
        .rejectedWith("ERC20: transfer amount exceeds balance");
    });

    it("should revert when ERC20 value lower than reservePrice", async function () {
      const reservePrice = 1000000;
      await createAuctionOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      const lowerPrice = 500000;
      const bidOrder = createBidOrder({
        orderId: 1,
        price: lowerPrice
      });

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: The minimum bid must match the reserve price");
    });

    it("should revert when ERC20 value lower than highest bid", async function () {
      const reservePrice = 1000000;
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[1],
        market: market,
        currency: idrt
      });
      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[2],
        market: market,
        currency: idrt
      });

      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const secondBidPrice = 1000000;
      const bidOrder = createBidOrder({
        account: accounts[2],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      expect(bidOrder)
        .eventually
        .rejectedWith("Market: Bid price to low");
    });

    it("should be able to bid with ERC20 for first time", async function () {
      const reservePrice = 1000000;
      await createAuctionOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      const block = await ethers.provider.getBlockNumber();

      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[1],
        market: market,
        currency: idrt
      });

      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const currentOrder = await market.orders(1);

      await expectEvents({
        block: block,
        event: "OrderBidCreated",
        length: 1,
        index: 0,
        args: {
          bidder: currentOrder.bidder,
          price: currentOrder.price,
          extended: false
        }
      });
    });

    it("should be able to bid with ERC20 for second time", async function () {
      const reservePrice = 1000000;
      await createAuctionOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      const block = await ethers.provider.getBlockNumber();

      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[1],
        market: market,
        currency: idrt
      });
      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[2],
        market: market,
        currency: idrt
      });

      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const secondBidPrice = 1100000;
      createBidOrder({
        account: accounts[2],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      const currentOrder = await market.orders(1);
      await expectEvents({
        block: block,
        event: "OrderBidCreated",
        length: 2,
        index: 0,
        args: {
          bidder: currentOrder.bidder,
          price: currentOrder.price,
          extended: false
        }
      });
    });

    it("should be able to bid with ERC20 and extend the duration", async function () {
      const reservePrice = 1000000;
      const duration = 60 * 15;
      await createAuctionOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
        duration: duration
      });

      const block = await ethers.provider.getBlockNumber();

      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[1],
        market: market,
        currency: idrt
      });
      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[2],
        market: market,
        currency: idrt
      });

      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const secondBidPrice = 1100000;
      await createBidOrder({
        account: accounts[2],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      const currentOrder = await market.orders(1);
      await expectEvents({
        block: block,
        event: "OrderBidCreated",
        length: 2,
        index: 1,
        args: {
          bidder: currentOrder.bidder,
          price: currentOrder.price,
          extended: true
        }
      });
    });

    it("should be able refund ERC20 to first bidder", async function () {
      const reservePrice = 1000000;
      await createAuctionOrder({
        currency: idrt.address,
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[1],
        market: market,
        currency: idrt
      });
      await mintAndApproveERC20({
        balance: 2000000,
        account: accounts[2],
        market: market,
        currency: idrt
      });

      const lastBalance = await idrt.balanceOf(accounts[1].address);

      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const secondBidPrice = 1100000;
      createBidOrder({
        account: accounts[2],
        orderId: 1,
        price: secondBidPrice,
        value: secondBidPrice
      });

      const expectedRefund = BigNumber.from("1000000");
      await expectBalances([
        {
          address: accounts[1],
          balance: lastBalance,
          profit: expectedRefund
        }
      ]);
    });
  });

  describe("Cancel auction order", async function () {
    it("should revert when orderId not exist", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      const cancel = cancelOrder({ orderId: 2 });

      expect(cancel)
        .eventually
        .rejectedWith("Market: The order does not exist");
    });

    it("should revert when not order creator", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      const cancel = cancelOrder({ account: accounts[1], orderId: 1 });

      expect(cancel)
        .eventually
        .rejectedWith("Market: Only can be called by order creator");
    });

    it("should cancel the order", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      await cancelOrder({ orderId: 1 });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).is.equal(accounts[0].address);
    });

    it("should revert when auction in progress", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
      });

      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const cancel = cancelOrder({ orderId: 1 });

      expect(cancel)
        .eventually
        .rejectedWith("Market: Auction in progress");
    });
  });

  describe("Update auction order", async function () {
    it("should revert when orderId not exist", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      const updateOrder = updateAuctionOrder({ orderId: 1, reservePrice: reservePrice });

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: The order does not exist");
    });

    it("should revert when not order creator", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      const updateOrder = updateAuctionOrder({
        account: accounts[1],
        orderId: 1,
        reservePrice: reservePrice
      });

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: Only can be called by order creator");
    });

    it("should revert when auction in progress", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      await createBidOrder({
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const updateOrder = updateAuctionOrder({
        orderId: 1,
        reservePrice: reservePrice
      });

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: Auction in progress");
    });

    it("should revert when reservePrice is zero", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      const updateOrder = updateAuctionOrder({
        orderId: 1,
        reservePrice: 0
      });

      expect(updateOrder)
        .eventually
        .rejectedWith("Market: reservePrice cannot be zero");
    });

    it("should update the order", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      const block = await ethers.provider.getBlockNumber();
      const newReservePrice = ethers.utils.parseEther("2");
      await updateAuctionOrder({
        orderId: 1,
        reservePrice: newReservePrice
      });

      const currentOrder = await market.orders(1);
      await expectEvents({
        block: block,
        event: "OrderUpdated",
        length: 1,
        index: 0,
        args: {
          reservePrice: currentOrder.reservePrice
        }
      })
    });
  });

  describe("Finalize auction order", async function () {
    it("should revert when auction not started", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      const finalize = finalizeAuctionOrder({ orderId: 1 });

      expect(finalize)
        .eventually
        .rejectedWith("Market: Auction not started");
    });

    it("should revert when auction in progress", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice
      });

      await createBidOrder({
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const finalize = finalizeAuctionOrder({ orderId: 1 });

      expect(finalize)
        .eventually
        .rejectedWith("Market: Auction in progress");
    });

    it("should able to finalize auction", async function () {
      const reservePrice = ethers.utils.parseEther("1");
      await createAuctionOrder({
        tokenId: 1,
        tokenContract: nfts.test.address,
        reservePrice: reservePrice,
        duration: 1
      });

      await createBidOrder({
        account: accounts[1],
        orderId: 1,
        price: reservePrice,
        value: reservePrice
      });

      const block = await ethers.provider.getBlockNumber();
      const lastBalance = await ethers.provider.getBalance(accounts[0].address);
      const treasuryLastBalance = await ethers.provider.getBalance(accounts[9].address);
      const currentOrder = await market.orders(1);

      await new Promise(r => setTimeout(r, 2000));
      await finalizeAuctionOrder({ orderId: 1 });

      const expectedId = BigNumber.from("1");
      const expectedMarketPortion = ethers.utils.parseEther("0.05");
      const expectedCreatorPortion = BigNumber.from("0");
      const expectedOwnerPortion = ethers.utils.parseEther("0.95");

      await expectEvents({
        block: block,
        event: "OrderFinished",
        length: 1,
        index: 0,
        args: {
          orderId: expectedId,
          orderType: currentOrder.orderType,
          tokenId: currentOrder.tokenId,
          tokenContract: currentOrder.tokenContract,
          tokenOwner: currentOrder.tokenOwner,
          bidder: accounts[1].address,
          price: currentOrder.price,
          marketPortion: expectedMarketPortion,
          creatorPortion: expectedCreatorPortion,
          ownerPortion: expectedOwnerPortion,
          currency: currentOrder.currency
        }
      });

      const tokenOwner = await nfts.test.ownerOf(1);
      expect(tokenOwner).to.eq(accounts[1].address);

      const expectedProfit = BigNumber.from("950000000000000000");
      const expectedTreasuryProfit = BigNumber.from("50000000000000000");

      await expectBalances([
        {
          address: accounts[2].address,
          balance: lastBalance,
          profit: expectedProfit
        },
        {
          address: accounts[9].address,
          balance: treasuryLastBalance,
          profit: expectedTreasuryProfit
        },
      ]);
    });
  });
});
