// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "./interfaces/IMarket.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IERC2981.sol";
import "./interfaces/IRoyaltyV1.sol";
import "./interfaces/IRoyaltyV2.sol";

import "hardhat/console.sol";

contract Market is
  Initializable,
  IMarket,
  OwnableUpgradeable,
  ReentrancyGuardUpgradeable,
  ERC721HolderUpgradeable
{
  using SafeMathUpgradeable for uint256;
  using CountersUpgradeable for CountersUpgradeable.Counter;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  address public marketTreasury;
  uint256 public marketFee;
  address public wethAddress;

  mapping(uint256 => Order) public orders;

  CountersUpgradeable.Counter private _orderIdCounter;

  bytes4 constant ERC721InterfaceId = 0x80ac58cd;
  // NFT Royalty Standard
  bytes4 constant ERC2981InterfaceId = 0x2a55205a;
  // NFT Royalty: Foundation, Rarible
  bytes4 constant RoyaltyV1InterfaceId = 0xb7799584;
  // NFT Royalty: Rarible
  bytes4 constant RoyaltyV2InterfaceId = 0x44c74bcc;

  function initialize(address weth) public initializer {
    __Ownable_init();
    __ReentrancyGuard_init();

    wethAddress = weth;
  }

  /* ========== PUBLIC ========== */

  function createSellOrder(
    uint256 tokenId,
    address tokenContract,
    uint256 price,
    address currency
  ) public override nonReentrant returns (uint256) {
    uint256 orderId = _createOrder(
      tokenId,
      tokenContract,
      price,
      0,
      0,
      0,
      0,
      currency
    );

    return orderId;
  }

  function createBuyOrder(uint256 orderId)
    public
    payable
    override
    nonReentrant
    orderExists(orderId)
  {
    Order storage _order = orders[orderId];

    _order.bidder = payable(msg.sender);

    _handleIncoming(_order.price, _order.currency);

    emit OrderBuyCreated(
      orderId,
      _order.tokenId,
      _order.tokenContract,
      _order.tokenOwner,
      _order.bidder,
      _order.price,
      _order.currency
    );

    try
      IERC721Upgradeable(_order.tokenContract).safeTransferFrom(
        address(this),
        _order.bidder,
        _order.tokenId
      )
    {} catch {
      _handleOutgoing(_order.bidder, _order.price, _order.currency);
      return;
    }

    (
      uint256 _marketPortion,
      uint256 _creatorPortion,
      uint256 _ownerPortion
    ) = _distributeFunds(
        _order.tokenId,
        _order.tokenContract,
        _order.tokenOwner,
        _order.price,
        _order.currency
      );

    emit OrderFinished(
      orderId,
      _order.orderType,
      _order.tokenId,
      _order.tokenContract,
      _order.tokenOwner,
      _order.bidder,
      _order.price,
      _marketPortion,
      _creatorPortion,
      _ownerPortion,
      _order.currency
    );

    delete orders[orderId];
  }

  function createAuctionOrder(
    uint256 tokenId,
    address tokenContract,
    uint256 reservePrice,
    uint256 duration,
    uint256 extensionDuration,
    uint256 minBidIncrement,
    address currency
  ) public override nonReentrant returns (uint256) {
    uint256 orderId = _createOrder(
      tokenId,
      tokenContract,
      0,
      reservePrice,
      duration,
      extensionDuration,
      minBidIncrement,
      currency
    );

    return orderId;
  }

  function createBidOrder(uint256 orderId, uint256 price)
    public
    payable
    override
    nonReentrant
    orderExists(orderId)
  {
    Order storage _order = orders[orderId];

    if (_order.endTime == 0) {
      if (_order.currency == address(0)) {
        require(
          (_order.reservePrice <= msg.value && _order.reservePrice <= price),
          "Market: The minimum bid must match the reserve price"
        );
      } else {
        require(
          _order.reservePrice <= price,
          "Market: The minimum bid must match the reserve price"
        );
      }
    } else {
      require(_order.endTime > block.timestamp, "Market: Auction is over");
      require(
        _order.bidder != msg.sender,
        "Market: You already at highest bid"
      );

      uint256 minBidPrice = ((_order.price * _order.minBidIncrement) / 10000) +
        _order.price;
      if (_order.currency == address(0)) {
        require((msg.value >= minBidPrice), "Market: Bid price to low");
      } else {
        require((price >= minBidPrice), "Market: Bid price to low");
      }
    }

    bool extendedDuration = false;
    if (_order.endTime == 0) {
      _handleIncoming(price, _order.currency);

      _order.price = price;
      _order.bidder = payable(msg.sender);
      _order.endTime = block.timestamp + _order.duration;
    } else {
      _handleIncoming(price, _order.currency);

      uint256 originalPrice = _order.price;
      address payable originalBidder = _order.bidder;

      _order.price = price;
      _order.bidder = payable(msg.sender);

      if (_order.endTime - block.timestamp < _order.extensionDuration) {
        _order.endTime = block.timestamp + _order.extensionDuration;
        extendedDuration = true;
      }

      _handleOutgoing(originalBidder, originalPrice, _order.currency);
    }

    emit OrderBidCreated(
      orderId,
      _order.tokenId,
      _order.tokenContract,
      _order.tokenOwner,
      _order.bidder,
      _order.price,
      _order.currency,
      extendedDuration
    );
  }

  function cancelOrder(uint256 orderId)
    public
    override
    nonReentrant
    orderExists(orderId)
    onlyOrderCreator(orderId)
  {
    Order storage _order = orders[orderId];

    if (_order.reservePrice > 0) {
      require(_order.endTime == 0, "Market: Auction in progress");
    }

    IERC721Upgradeable(_order.tokenContract).safeTransferFrom(
      address(this),
      _order.tokenOwner,
      _order.tokenId
    );

    emit OrderCanceled(orderId, _order.tokenId, _order.tokenContract);

    delete orders[orderId];
  }

  function updateSellOrder(uint256 orderId, uint256 price)
    public
    override
    orderExists(orderId)
    onlyOrderCreator(orderId)
  {
    require(price > 0, "Market: Price cannot be zero");

    Order storage _order = orders[orderId];
    _order.price = price;

    emit OrderUpdated(
      orderId,
      _order.orderType,
      _order.tokenId,
      _order.tokenContract,
      _order.price,
      _order.reservePrice,
      _order.currency
    );
  }

  function updateAuctionOrder(uint256 orderId, uint256 reservePrice)
    public
    override
  {}

  function finalizeAuctionOrder(uint256 orderId) public override nonReentrant {}

  /* ========== INTERNAL ========== */

  function _createOrder(
    uint256 tokenId,
    address tokenContract,
    uint256 price,
    uint256 reservePrice,
    uint256 duration,
    uint256 extensionDuration,
    uint256 minBidIncrement,
    address currency
  ) internal returns (uint256) {
    require(
      IERC165Upgradeable(tokenContract).supportsInterface(ERC721InterfaceId),
      "Market: tokenContract does not support ERC721 interface"
    );

    address tokenOwner = IERC721Upgradeable(tokenContract).ownerOf(tokenId);
    require(
      msg.sender == IERC721Upgradeable(tokenContract).getApproved(tokenId) ||
        msg.sender == tokenOwner,
      "Market: Caller must be approved or owner for tokenId"
    );

    uint8 orderType = reservePrice <= 0 && duration <= 0 ? 0 : 1;
    if (orderType == 0) {
      require(price > 0, "Market: Price cannot be zero");
    } else {
      require(reservePrice > 0, "Market: reservePrice cannot be zero");
      require(duration > 0, "Market: Duration cannot be zero");

      extensionDuration = extensionDuration == 0 ? 60 * 15 : extensionDuration;
      minBidIncrement = minBidIncrement == 0 ? 100 : minBidIncrement;
    }

    _orderIdCounter.increment();
    uint256 orderId = _orderIdCounter.current();

    orders[orderId] = Order({
      orderType: orderType,
      tokenId: tokenId,
      tokenContract: tokenContract,
      tokenOwner: payable(tokenOwner),
      price: price,
      bidder: payable(address(0)),
      reservePrice: reservePrice,
      duration: duration,
      extensionDuration: extensionDuration,
      endTime: 0,
      minBidIncrement: minBidIncrement,
      currency: currency
    });

    IERC721Upgradeable(tokenContract).safeTransferFrom(
      tokenOwner,
      address(this),
      tokenId
    );

    emit OrderCreated(
      orderId,
      orderType,
      tokenId,
      tokenContract,
      tokenOwner,
      price,
      reservePrice,
      duration,
      extensionDuration,
      minBidIncrement,
      currency
    );

    return orderId;
  }

  function _checkRoyalties(address tokenContract) internal view returns (bool) {
    bool success = IERC165Upgradeable(tokenContract).supportsInterface(
      ERC2981InterfaceId
    ) ||
      IERC165Upgradeable(tokenContract).supportsInterface(
        RoyaltyV1InterfaceId
      ) ||
      IERC165Upgradeable(tokenContract).supportsInterface(RoyaltyV2InterfaceId);

    return success;
  }

  function _getRoyalties(
    uint256 tokenId,
    address tokenContract,
    uint256 salePrice
  ) internal view returns (address payable[] memory, uint256[] memory) {
    address payable[] memory receiver;
    uint256[] memory royaltyAmount;

    if (
      IERC165Upgradeable(tokenContract).supportsInterface(ERC2981InterfaceId)
    ) {
      (address _receiver, uint256 _royaltyAmount) = IERC2981(tokenContract)
        .royaltyInfo(tokenId, salePrice);

      receiver = new address payable[](1);
      receiver[0] = payable(_receiver);
      royaltyAmount = new uint256[](1);
      royaltyAmount[0] = _royaltyAmount;
    } else if (
      IERC165Upgradeable(tokenContract).supportsInterface(RoyaltyV1InterfaceId)
    ) {
      address payable[] memory _recipients = IRoyaltyV1(tokenContract)
        .getFeeRecipients(tokenId);
      uint256[] memory _feeBps = IRoyaltyV1(tokenContract).getFeeBps(tokenId);

      receiver = new address payable[](_recipients.length);
      royaltyAmount = new uint256[](_feeBps.length);
      for (uint256 i = 0; i < _recipients.length; i++) {
        receiver[i] = _recipients[i];
        royaltyAmount[i] = (salePrice * _feeBps[i]) / 10000;
      }
    } else if (
      IERC165Upgradeable(tokenContract).supportsInterface(RoyaltyV2InterfaceId)
    ) {
      IRoyaltyV2.Royalty[] memory _royalties = IRoyaltyV2(tokenContract)
        .getRoyalties(tokenId);

      receiver = new address payable[](_royalties.length);
      royaltyAmount = new uint256[](_royalties.length);
      for (uint256 i = 0; i < _royalties.length; i++) {
        receiver[i] = _royalties[i].account;
        royaltyAmount[i] = (salePrice * _royalties[i].value) / 10000;
      }
    }

    return (receiver, royaltyAmount);
  }

  function _handleIncoming(uint256 amount, address currency) internal {
    if (currency == address(0)) {
      require(
        msg.value == amount,
        "Market: Sent ETH value does not match the specified price"
      );

      IWETH(wethAddress).deposit{ value: amount }();
    } else {
      // FIXME: Make sure the ERC20 token amount is right, does not have a fee
      // for the transfer. If they do, transfer back the fund to sender and
      // revert action. How to check transffered amount?
      IERC20Upgradeable(currency).safeTransferFrom(
        msg.sender,
        address(this),
        amount
      );
    }
  }

  function _handleOutgoing(
    address to,
    uint256 amount,
    address currency
  ) internal {
    if (currency == address(0)) {
      IWETH(wethAddress).withdraw(amount);

      if (!_safeTransferETH(payable(to), amount)) {
        IWETH(wethAddress).deposit{ value: amount }();
        IERC20Upgradeable(wethAddress).safeTransfer(to, amount);
      }
    } else {
      IERC20Upgradeable(currency).safeTransfer(to, amount);
    }
  }

  function _distributeFunds(
    uint256 tokenId,
    address tokenContract,
    address tokenOwner,
    uint256 price,
    address currency
  )
    internal
    returns (
      uint256 marketPortion,
      uint256 creatorPortion,
      uint256 ownerPortion
    )
  {
    uint256 _marketPortion = (price * marketFee) / 10000;
    _handleOutgoing(marketTreasury, _marketPortion, currency);

    uint256 _creatorPortion = 0;
    if (_checkRoyalties(tokenContract)) {
      (
        address payable[] memory _creators,
        uint256[] memory _royalties
      ) = _getRoyalties(tokenId, tokenContract, price);

      for (uint256 i = 0; i < _creators.length; i++) {
        _handleOutgoing(_creators[i], _royalties[i], currency);
        _creatorPortion += _royalties[i];
      }
    }

    uint256 _ownerPortion = price - (_marketPortion + _creatorPortion);
    _handleOutgoing(tokenOwner, _ownerPortion, currency);

    return (_marketPortion, _creatorPortion, _ownerPortion);
  }

  function _safeTransferETH(address payable to, uint256 value)
    internal
    returns (bool)
  {
    (bool success, ) = to.call{ value: value }("");
    return success;
  }

  receive() external payable {}

  fallback() external payable {}

  /* ========== MODIFIER ========== */

  modifier orderExists(uint256 orderId) {
    require(
      orders[orderId].tokenOwner != address(0),
      "Market: The order does not exist"
    );
    _;
  }

  modifier onlyOrderCreator(uint256 orderId) {
    require(
      orders[orderId].tokenOwner == msg.sender,
      "Market: Only can be called by order creator"
    );
    _;
  }

  /* ========== ONLY OWNER ========== */

  function setMarketTreasury(address treasury) external onlyOwner {
    marketTreasury = treasury;
  }

  function setMarketFee(uint256 feeBps) external onlyOwner {
    marketFee = feeBps;
  }
}
