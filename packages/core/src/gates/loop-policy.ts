import type { GateEvaluation } from './types';

/**
 * Politique de la boucle « corriger jusqu'à résolution ».
 *
 * La boucle n'a pas de limite d'itérations par défaut (`maxIterations = 0`).
 * Pour éviter de tourner indéfiniment sur le même échec, elle détecte la stagnation :
 * quand la même empreinte d'échec revient `stagnationThreshold` fois de suite,
 * elle escalade (modèle de repli plus puissant, puis changement de stratégie).
 * Elle n'abandonne que lorsque toutes les escalades ont été tentées sans progrès.
 */
export interface LoopPolicy {
  /** 0 = illimité. */
  maxIterations: number;
  stagnationThreshold: number;
  /** Nombre de niveaux d'escalade disponibles avant abandon. */
  maxEscalations: number;
}

export const DEFAULT_LOOP_POLICY: LoopPolicy = {
  maxIterations: 0,
  stagnationThreshold: 3,
  maxEscalations: 3,
};

export interface LoopState {
  iteration: number;
  signatures: string[];
  escalationLevel: number;
}

export type LoopDecision =
  | { action: 'done' }
  | { action: 'fix'; escalationLevel: number }
  | { action: 'escalate'; escalationLevel: number; reason: string }
  | { action: 'abort'; reason: string };

export function initialLoopState(): LoopState {
  return { iteration: 0, signatures: [], escalationLevel: 0 };
}

export function recordIteration(state: LoopState, evaluation: GateEvaluation): LoopState {
  return {
    ...state,
    iteration: state.iteration + 1,
    signatures: [...state.signatures, evaluation.signature],
  };
}

function trailingRepeats(signatures: string[]): number {
  const last = signatures.at(-1);
  if (last === undefined) return 0;
  let count = 0;
  for (let i = signatures.length - 1; i >= 0 && signatures[i] === last; i--) count++;
  return count;
}

export function decideNext(state: LoopState, evaluation: GateEvaluation, policy: LoopPolicy = DEFAULT_LOOP_POLICY): LoopDecision {
  if (evaluation.passed) return { action: 'done' };

  if (policy.maxIterations > 0 && state.iteration >= policy.maxIterations) {
    return { action: 'abort', reason: `Limite de ${policy.maxIterations} itérations atteinte.` };
  }

  // Les répétitions sont comptées depuis la dernière escalade.
  if (trailingRepeats(state.signatures) >= policy.stagnationThreshold) {
    if (state.escalationLevel >= policy.maxEscalations) {
      return {
        action: 'abort',
        reason: `Aucun progrès après ${policy.maxEscalations} escalade(s) : le même échec revient à chaque itération.`,
      };
    }
    return {
      action: 'escalate',
      escalationLevel: state.escalationLevel + 1,
      reason: `Le même échec est revenu ${policy.stagnationThreshold} fois : changement de stratégie.`,
    };
  }

  return { action: 'fix', escalationLevel: state.escalationLevel };
}

/** Applique une escalade : on repart d'un historique vide pour mesurer l'effet de la nouvelle stratégie. */
export function applyEscalation(state: LoopState, level: number): LoopState {
  return { ...state, escalationLevel: level, signatures: [] };
}
