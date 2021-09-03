// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./ERC2981.sol";

contract ERC721Royalty is ERC721, ERC2981, Ownable {
  using Counters for Counters.Counter;

  Counters.Counter private _tokenIdCounter;

  struct Royalty {
    address recipient;
    uint256 value;
  }

  mapping(uint256 => Royalty) internal _royalties;

  constructor() ERC721("ERC721Royalty", "TEST") {}

  function safeMint(address to, uint256 royaltyBps) public onlyOwner {
    _tokenIdCounter.increment();
    uint256 _tokenId = _tokenIdCounter.current();
    _safeMint(to, _tokenId);
    _royalties[_tokenId] = Royalty(to, royaltyBps);
  }

  /// @dev Dumb implementation
  function royaltyInfo(uint256 _tokenId, uint256 _salePrice)
    public
    view
    override
    returns (address receiver, uint256 royaltyAmount)
  {
    Royalty memory royalty = _royalties[_tokenId];

    if (royalty.recipient == address(0)) {
      return (address(0), 0);
    }

    return (royalty.recipient, (_salePrice * royalty.value) / 10000);
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, ERC2981)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
