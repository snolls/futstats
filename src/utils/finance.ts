import { AppUserCustomData } from "@/types/user";

/**
 * Calcula el saldo visible de un usuario basado en el rol del observador.
 * 
 * @param targetUser El usuario del que queremos saber la deuda.
 * @param observerRole Rol del usuario que está mirando ('admin', 'superadmin', 'user').
 * @param managedGroupIds Array de IDs de grupos que administra el observador (si es admin).
 * @returns El saldo total visible (Positivo = Deuda del usuario hacia la app, Negativo = Saldo a favor del usuario).
 */
export function calculateVisibleBalance(
    targetUser: AppUserCustomData,
    observerRole: string | undefined,
    managedGroupIds: string[] = []
): number {
    // 0. Base: Deudas por Partidos (pending matches)
    // Nota: Esto usualmente se calcula aparte sumando match_stats. 
    // Si la "deuda" viene SOLO del mapa `debts` (manual + resultados), usamos eso.
    // Si hay deuda legacy `manualDebt`, la incluimos si es superadmin o si no hay restricción.

    // Asumiremos que el input `targetUser` tiene el mapa `debts` o `groupDebts`.
    const debtsMap = targetUser.debts || targetUser.groupDebts || {};
    let total = 0;

    if (observerRole === 'superadmin') {
        // Superadmin ve TODO
        // 1. Suma del mapa de deudas (Multi-Grupo)
        Object.values(debtsMap).forEach(val => {
            total += (typeof val === 'number' ? val : 0);
        });

        // 2. Suma de legacy manualDebt si existe (aunque debería haber sido migrada)
        if (targetUser.manualDebt) {
            total += targetUser.manualDebt;
        }

        // 3. Deuda legacy si existe
        if (targetUser.debt) {
            total += targetUser.debt;
        }

    } else if (observerRole === 'admin') {
        // Admin solo ve deudas de SUS grupos
        managedGroupIds.forEach(groupId => {
            if (debtsMap[groupId]) {
                total += debtsMap[groupId];
            }
        });

        // El admin NO ve 'manualDebt' global ni 'debt' legacy, porque no sabe a quién pertenece.
        // A menos que asumamos algo, pero la instrucción dice "Solo ver suma de grupos que ÉL administra".
    } else {
        // Usuario normal viendo su propio perfil o directorio público (si aplica)
        // Generalmente ve todo lo suyo, pero si ve a otro, ¿qué ve?
        // Asumiremos que si es role 'user', ve todo si es él mismo (se maneja fuera), 
        // o 0 si ve a otro. Pero esta función es para "Visible Balance".
        // Si no se especifica, devolvemos 0 por seguridad, o todo si es 'user' (self-view logic often uses this too).
        // Por seguridad: 0.
        return 0;
    }

    return total;
}
