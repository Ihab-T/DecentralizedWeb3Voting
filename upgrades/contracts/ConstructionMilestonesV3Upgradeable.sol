// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// V3: добавили updatedAt[elementId] — когда последний раз меняли стадию
/// ВАЖНО: сохраняем порядок и ИМЕНА старых переменных.
/// Если в V1/V2 переменная называлась `_stageOf`, оставляем её так,
/// а для удобства даём внешний геттер `stageOf(...)` с тем же ABI.
contract ConstructionMilestonesV3Upgradeable is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    // ===== СТАРЫЕ ПЕРЕМЕННЫЕ (порядок и имена НЕ трогаем) =====
    address public oracle;

    // В предыдущей реализации был именно `_stageOf` → оставляем имя:
    mapping(bytes32 => uint8) private _stageOf;

    // Если этого поля раньше НЕ было, оно считается "новым" (это нормально).
    // Если было — оставляем на том же месте и с тем же именем.
    mapping(bytes32 => string) public noteOf;

    // ===== НОВОЕ В V3 =====
    mapping(bytes32 => uint256) public updatedAt;

    // ОБЯЗАТЕЛЬНО держим gap, уменьшив его длину на число новых переменных.
    // Если в исходнике gap был, к примеру, uint256[50] __gap; и мы добавили 2 новых слота,
    // ставим тут 48. Если компилятор скажет "ожидается другой размер", поменяй 48 на 49.
    uint256[47] private __gap;

    // ----- события и модификаторы -----
    event StageUpdated(bytes32 indexed elementId, uint8 stage, address indexed updater, uint256 ts);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not authorized");
        _;
    }

    // ----- инициализация -----
    function initialize(address _oracle) public initializer {
        require(_oracle != address(0), "Zero oracle");
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();

        oracle = _oracle;
        emit OracleChanged(address(0), _oracle);
    }

    // На случай отдельной инициализации для V3 (не обязательно)
    function initializeV3() public reinitializer(3) {
        // пусто
    }

    // UUPS защита
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ----- логика -----
    // СЕТТЕР пишет в _stageOf (старое имя), чтобы не ломать layout:
    function setStage(bytes32 elementId, uint8 newStage) external onlyOracle {
        _stageOf[elementId] = newStage;
        updatedAt[elementId] = block.timestamp;
        emit StageUpdated(elementId, newStage, msg.sender, block.timestamp);
    }

    function setNote(bytes32 elementId, string calldata note) external onlyOracle {
        noteOf[elementId] = note;
    }

    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Zero oracle");
        emit OracleChanged(oracle, newOracle);
        oracle = newOracle;
    }

    // ВНЕШНИЙ ГЕТТЕР с именем stageOf — сохраняем ABI, которое юзает Unity:
    function stageOf(bytes32 elementId) external view returns (uint8) {
        return _stageOf[elementId];
    }

    function version() external pure returns (uint256) { return 3; }
}
