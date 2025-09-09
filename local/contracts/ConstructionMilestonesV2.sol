// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ConstructionMilestonesV2 is AccessControl {
    // Роль для оракулов (кто может ставить стадии)
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // Текущие стадии по элементам
    mapping(bytes32 => uint8) public stageOf;

    event StageUpdated(bytes32 indexed elementId, uint8 indexed newStage, address indexed updater, uint256 timestamp);

    constructor(address initialOracle) {
        require(initialOracle != address(0), "Zero oracle");
        // Раздаём роли
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // админ — деплойер
        _grantRole(ORACLE_ROLE, initialOracle);     // первый оракул
    }

    // Менять стадии может только обладатель ORACLE_ROLE
    function setStage(bytes32 elementId, uint8 newStage) external onlyRole(ORACLE_ROLE) {
        stageOf[elementId] = newStage;
        emit StageUpdated(elementId, newStage, msg.sender, block.timestamp);
    }

    // Удобные функции для админа, чтобы управлять оракулами
    function grantOracle(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(ORACLE_ROLE, account);
    }

    function revokeOracle(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ORACLE_ROLE, account);
    }
}
