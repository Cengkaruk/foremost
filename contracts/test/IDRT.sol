// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract IDRT is ERC20, Ownable {
  using SafeERC20 for IERC20;

  constructor() ERC20("Rupiah Test", "IDRT") {}

  function mint(address to, uint256 amount) public onlyOwner {
    _mint(to, amount);
  }
}
