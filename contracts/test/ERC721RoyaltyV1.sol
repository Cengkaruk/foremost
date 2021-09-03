// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./RoyaltyV1.sol";

contract ERC721RoyaltyV1 is ERC721, RoyaltyV1, Ownable {
  using Counters for Counters.Counter;

  Counters.Counter private _tokenIdCounter;

  struct Royalty {
    address recipient;
    uint256 value;
  }

  mapping(uint256 => Royalty) internal _royalties;

  constructor() ERC721("ERC721RoyaltyV1", "TEST") {}

  function safeMint(address to, uint256 royaltyBps) public onlyOwner {
    _tokenIdCounter.increment();
    uint256 _tokenId = _tokenIdCounter.current();
    _safeMint(to, _tokenId);
    _royalties[_tokenId] = Royalty(to, royaltyBps);

    address[] memory recipients = new address[](1);
    recipients[0] = to;
    uint256[] memory bps = new uint256[](1);
    bps[0] = royaltyBps;
    emit SecondarySaleFees(_tokenId, recipients, bps);
  }

  /// @dev Dumb implementation
  function getFeeRecipients(uint256 id)
    public
    view
    override
    returns (address payable[] memory)
  {
    address payable[] memory result = new address payable[](1);
    Royalty memory royalty = _royalties[id];
    result[0] = payable(address(royalty.recipient));
    return result;
  }

  /// @dev Dumb implementation
  function getFeeBps(uint256 id)
    public
    view
    override
    returns (uint256[] memory)
  {
    uint256[] memory result = new uint256[](2);
    Royalty memory royalty = _royalties[id];
    result[0] = royalty.value;
    return result;
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, RoyaltyV1)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
