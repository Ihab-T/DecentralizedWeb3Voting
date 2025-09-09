// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract ConstructionMilestonesV1Upgradeable is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    /// @notice адрес, которому разрешено менять стадии (ваш оракул-сервис)
    address public oracle;

    /// @dev храним стадии по id (bytes32)
    mapping(bytes32 => uint8) private _stageOf;

    event StageUpdated(bytes32 indexed elementId, uint8 stage, address indexed updater, uint256 timestamp);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not authorized");
        _;
    }

    /// @notice Инициализатор (заменяет конструктор в апгрейд-контрактах)
    /// @param _oracle начальный адрес оракула
    function initialize(address _oracle) public initializer {
        require(_oracle != address(0), "Zero oracle");

        __Ownable_init(msg.sender);   // OZ v5: передаем владельца
        __UUPSUpgradeable_init();

        oracle = _oracle;
        emit OracleChanged(address(0), _oracle);
    }

    /// --- Публичные/внешние функции ---

    function setStage(bytes32 elementId, uint8 newStage) external onlyOracle {
        _stageOf[elementId] = newStage;
        emit StageUpdated(elementId, newStage, msg.sender, block.timestamp);
    }

    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Zero oracle");
        address old = oracle;
        oracle = newOracle;
        emit OracleChanged(old, newOracle);
    }

    /// @notice геттер, эквивалентен public-mapping
    function stageOf(bytes32 elementId) external view returns (uint8) {
        return _stageOf[elementId];
    }

    /// @dev обязательный хук для UUPS — кто может апгрейдить
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @dev резервируем место под будущие переменные (чтобы не сломать layout при апгрейдах)
    uint256[49] private __gap;
}
