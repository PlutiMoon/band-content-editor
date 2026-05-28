import { runHealthCheck } from './health_check.js';
import { buildHealthRepairPlan } from './health_repairs.js';

export function buildPublishGate(project) {
  const issues = runHealthCheck(project);
  const repairPlan = buildHealthRepairPlan(project, issues);
  const errorCount = issues.filter(item => item.severity === 'error').length;
  const warningCount = issues.filter(item => item.severity === 'warning').length;
  const repairableCount = repairPlan.repairable.length;
  const manualCount = repairPlan.manual.length;
  let status = 'pass';

  if (errorCount > 0 || repairableCount > 0) status = 'blocked';
  else if (warningCount > 0) status = 'warning';

  return {
    status,
    issues,
    repairPlan,
    errorCount,
    warningCount,
    repairableCount,
    manualCount,
  };
}

export function formatPublishGateMessage(gate) {
  if (!gate || gate.status === 'pass') return '发布检查通过';
  if (gate.status === 'warning') {
    return `发布检查有 ${gate.warningCount} 项警告，仍可继续。`;
  }
  return `发布检查未通过：错误 ${gate.errorCount} 项，可自动修复 ${gate.repairableCount} 项，需人工处理 ${gate.manualCount} 项。请先到体检面板处理。`;
}
