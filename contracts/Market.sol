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

    require(price > 0, "Market: Price cannot be zero");

    _orderIdCounter.increment();
    uint256 orderId = _orderIdCounter.current();

    orders[orderId] = Order({
      orderType: 0,
      tokenId: tokenId,
      tokenContract: tokenContract,
      tokenOwner: payable(tokenOwner),
      price: price,
      reservePrice: 0,
      duration: 0,
      bidder: payable(address(0)),
      currency: currency
    });

    IERC721Upgradeable(tokenContract).safeTransferFrom(
      tokenOwner,
      address(this),
      tokenId
    );

    emit OrderCreated(
      orderId,
      0,
      tokenId,
      tokenContract,
      tokenOwner,
      price,
      0,
      0,
      currency
    );

    return orderId;
  }

  function createBuyOrder(uint256 orderId, uint256 price)
    public
    payable
    override
    nonReentrant
    orderExists(orderId)
  {
    Order memory _order = orders[orderId];

    _order.bidder = payable(msg.sender);

    _handleIncoming(price, _order.currency);

    emit OrderBuyCreated(
      orderId,
      _order.tokenId,
      _order.tokenContract,
      _order.tokenOwner,
      msg.sender,
      price,
      _order.currency
    );

    try
      IERC721Upgradeable(_order.tokenContract).safeTransferFrom(
        address(this),
        _order.bidder,
        _order.tokenId
      )
    {} catch {
      _handleOutgoing(msg.sender, price, _order.currency);
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
        price,
        _order.currency
      );

    emit OrderFinished(
      orderId,
      _order.orderType,
      _order.tokenId,
      _order.tokenContract,
      _order.tokenOwner,
      msg.sender,
      price,
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
    address currency
  ) public override nonReentrant returns (uint256) {}

  function createBidOrder(uint256 orderId, uint256 price)
    public
    payable
    override
    nonReentrant
  {}

  function cancelOrder(uint256 orderId)
    public
    override
    nonReentrant
    orderExists(orderId)
    onlyOrderCreator(orderId)
  {
    Order memory _order = orders[orderId];

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

    orders[orderId].price = price;

    Order memory _order = orders[orderId];
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

  function _createOrder() internal {}

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
