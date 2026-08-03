import { describe, expect, it } from 'vitest';
import {
  TOWER_KINDS,
  getBaseSkillUpgradeCost,
  getSectorTowerInvestedCost,
  getSectorTowerRefund,
  getSectorTowerUpgradeCost,
  getTowerBuildCost,
  getTowerInvestedCost,
  getTowerRefund,
  getTowerUpgradeCost,
} from '../src/game/towerEconomy';

describe('tower economy', () => {
  it('keeps the original sector investment and refund schedule', () => {
    expect(getSectorTowerInvestedCost(1)).toBe(100);
    expect(getSectorTowerInvestedCost(2)).toBe(180);
    expect(getSectorTowerInvestedCost(3)).toBe(320);
    expect(getSectorTowerRefund(1)).toBe(50);
    expect(getSectorTowerRefund(2)).toBe(90);
    expect(getSectorTowerRefund(3)).toBe(160);
  });

  it('keeps the original sector upgrade prices before maximum level', () => {
    expect(getSectorTowerUpgradeCost(1)).toBe(80);
    expect(getSectorTowerUpgradeCost(2)).toBe(140);
    expect(getSectorTowerUpgradeCost(3)).toBeNull();
  });

  it('gives each tower family a construction price and two upgrade prices', () => {
    expect(TOWER_KINDS).toHaveLength(8);
    expect(getTowerBuildCost('sector')).toBe(100);
    expect(getTowerBuildCost('prism')).toBe(130);
    expect(getTowerBuildCost('pulse')).toBe(150);
    expect(getTowerBuildCost('anchor')).toBe(120);
    expect(getTowerBuildCost('arc')).toBe(170);
    expect(getTowerBuildCost('sniper')).toBe(240);
    expect(getTowerBuildCost('support')).toBe(200);
    expect(getTowerBuildCost('bulwark')).toBe(230);

    expect(getTowerUpgradeCost('prism', 1)).toBe(110);
    expect(getTowerUpgradeCost('prism', 2)).toBe(170);
    expect(getTowerUpgradeCost('pulse', 1)).toBe(120);
    expect(getTowerUpgradeCost('pulse', 2)).toBe(180);
    expect(getTowerUpgradeCost('anchor', 1)).toBe(90);
    expect(getTowerUpgradeCost('anchor', 2)).toBe(140);
    expect(getTowerUpgradeCost('arc', 1)).toBe(140);
    expect(getTowerUpgradeCost('arc', 2)).toBe(210);
    expect(getTowerUpgradeCost('sniper', 1)).toBe(190);
    expect(getTowerUpgradeCost('sniper', 2)).toBe(300);
    expect(getTowerUpgradeCost('support', 1)).toBe(150);
    expect(getTowerUpgradeCost('support', 2)).toBe(230);
    expect(getTowerUpgradeCost('bulwark', 1)).toBe(180);
    expect(getTowerUpgradeCost('bulwark', 2)).toBe(280);

    for (const kind of TOWER_KINDS) {
      expect(getTowerUpgradeCost(kind, 3)).toBeNull();
    }
  });

  it('refunds half of each family’s full construction and upgrade investment', () => {
    expect(getTowerInvestedCost('prism', 3)).toBe(410);
    expect(getTowerRefund('prism', 3)).toBe(205);
    expect(getTowerInvestedCost('pulse', 3)).toBe(450);
    expect(getTowerRefund('pulse', 3)).toBe(225);
    expect(getTowerInvestedCost('anchor', 3)).toBe(350);
    expect(getTowerRefund('anchor', 3)).toBe(175);
    expect(getTowerInvestedCost('arc', 3)).toBe(520);
    expect(getTowerRefund('arc', 3)).toBe(260);
    expect(getTowerInvestedCost('sniper', 3)).toBe(730);
    expect(getTowerRefund('sniper', 3)).toBe(365);
    expect(getTowerInvestedCost('support', 3)).toBe(580);
    expect(getTowerRefund('support', 3)).toBe(290);
    expect(getTowerInvestedCost('bulwark', 3)).toBe(690);
    expect(getTowerRefund('bulwark', 3)).toBe(345);
  });

  it('normalizes invalid tower levels before calculating price or refund', () => {
    expect(getTowerUpgradeCost('pulse', Number.NaN)).toBe(120);
    expect(getTowerInvestedCost('arc', -4)).toBe(170);
    expect(getTowerRefund('anchor', Number.POSITIVE_INFINITY)).toBe(60);
  });

  it('uses the same escalating price rhythm for base skill ranks', () => {
    expect(getBaseSkillUpgradeCost(0)).toBe(80);
    expect(getBaseSkillUpgradeCost(1)).toBe(140);
    expect(getBaseSkillUpgradeCost(2)).toBe(220);
    expect(getBaseSkillUpgradeCost(3)).toBe(320);
    expect(getBaseSkillUpgradeCost(4)).toBe(440);
    expect(getBaseSkillUpgradeCost(5)).toBeNull();
    expect(getBaseSkillUpgradeCost(Number.NaN)).toBe(80);
  });
});
