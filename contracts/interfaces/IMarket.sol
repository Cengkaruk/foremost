// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IMarket {
  struct Order {
    // 0 is fixed price and 1 is reserve auction
    uint8 orderType;
    uint256 tokenId;
    address tokenContract;
    address payable tokenOwner;
    uint256 price;
    address payable bidder;
    uint256 reservePrice;
    uint256 duration;
    uint256 extensionDuration;
    uint256 endTime;
    address currency;
  }

  event OrderCreated(
    uint256 orderId,
    uint8 orderType,
    uint256 indexed tokenId,
    address indexed tokenContract,
    address indexed tokenOwner,
    uint256 price,
    uint256 reservePrice,
    uint256 duration,
    uint256 extensionDuration,
    address currency
  );

  event OrderCanceled(
    uint256 indexed orderId,
    uint256 indexed tokenId,
    address indexed tokenContract
  );

  event OrderUpdated(
    uint256 indexed orderId,
    uint8 orderType,
    uint256 indexed tokenId,
    address indexed tokenContract,
    uint256 price,
    uint256 reservePrice,
    address currency
  );

  event OrderFinished(
    uint256 indexed orderId,
    uint8 orderType,
    uint256 tokenId,
    address tokenContract,
    address indexed tokenOwner,
    address indexed bidder,
    uint256 price,
    uint256 marketPortion,
    uint256 creatorPortion,
    uint256 ownerPortion,
    address currency
  );

  event OrderDurationExtended(
    uint256 indexed orderId,
    uint256 indexed tokenId,
    address indexed tokenContract,
    uint256 duration
  );

  event OrderBuyCreated(
    uint256 indexed orderId,
    uint256 tokenId,
    address tokenContract,
    address indexed tokenOwner,
    address indexed bidder,
    uint256 price,
    address currency
  );

  event OrderBidCreated(
    uint256 indexed orderId,
    uint256 tokenId,
    address tokenContract,
    address indexed tokenOwner,
    address indexed bidder,
    uint256 price,
    address currency,
    bool extended
  );

  function createSellOrder(
    uint256 tokenId,
    address tokenContract,
    uint256 price,
    address currency
  ) external returns (uint256);

  function createBuyOrder(uint256 orderId, uint256 price) external payable;

  function createAuctionOrder(
    uint256 tokenId,
    address tokenContract,
    uint256 reservePrice,
    uint256 duration,
    uint256 extensionDuration,
    address currency
  ) external returns (uint256);

  function createBidOrder(uint256 orderId, uint256 price) external payable;

  function cancelOrder(uint256 orderId) external;

  function updateSellOrder(uint256 orderId, uint256 price) external;

  function updateAuctionOrder(uint256 orderId, uint256 reservePrice) external;

  function finalizeAuctionOrder(uint256 orderId) external;
}
