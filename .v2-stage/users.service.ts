import { Injectable } from '@angular/core';
import { AdminService } from './admin.service';
import { User } from '../popup/add-user/Model/user';
import { catchError, map, switchMap, shareReplay, forkJoin, of, Observable, tap } from 'rxjs';
import { ApiService } from 'src/app/modules/core/services';
import { throwError } from 'rxjs';
import {
  extractApiErrorMessage,
  unwrapApiResponse,
} from '../helpers/auth-session.helper';
import {
  mapUiRoleToApiRoleKey,
  mapUiUserStatusToApi,
  mapUserFormToCreatePayload,
  mapUserFormToUpdatePayload,
  mapUserToUi,
  toItemResponse,
  toListResponse,
  unwrapApiList,
} from '../helpers/entity-mapper.helper';

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private roleKeyToId$?: Observable<Map<string, string>>;

  constructor(
    private _api: ApiService,
    private readonly adminService: AdminService,
  ) { }

  private getRoleMap(): Observable<Map<string, string>> {
    if (!this.roleKeyToId$) {
      this.roleKeyToId$ = this._api.get('v2/rbac/roles').pipe(
        map((res: any) => {
          const roles = unwrapApiResponse(res);
          const rows = Array.isArray(roles) ? roles : roles?.items || [];
          const mapByKey = new Map<string, string>();
          rows.forEach((role: any) => {
            if (role?.key && role?.id) {
              mapByKey.set(String(role.key), String(role.id));
            }
          });
          return mapByKey;
        }),
        shareReplay(1),
      );
    }
    return this.roleKeyToId$;
  }

  private fetchAllUsers(): Observable<any[]> {
    const loadPage = (cursor?: string, acc: any[] = []): Observable<any[]> => {
      const params = new URLSearchParams({ limit: '100', includeRoles: 'true' });
      if (cursor) params.set('cursor', cursor);
      return this._api.get(`v2/users?${params.toString()}`).pipe(
        switchMap((res: any) => {
          const page = unwrapApiList<any>(res);
          const merged = [...acc, ...page.items];
          if (page.pagination?.has_more && page.pagination?.next_cursor) {
            return loadPage(page.pagination.next_cursor, merged);
          }
          return of(merged);
        }),
      );
    };

    return loadPage();
  }

  getAllUsers() {
    return this.fetchAllUsers().pipe(
      map((users) => toListResponse(
        users.map((user) => mapUserToUi(user, user.roles || []))
      )),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to load users.'))),
    );
  }

  listUsersPage(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    includeRoles?: boolean;
  } = {}) {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page || 1));
    qs.set('limit', String(params.limit || 10));
    qs.set('includeRoles', params.includeRoles === false ? 'false' : 'true');
    if (params.search) qs.set('search', params.search);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    if (params.sort_by) qs.set('sort_by', params.sort_by);
    if (params.sort_order) qs.set('sort_order', params.sort_order);

    return this._api.get(`v2/users?${qs.toString()}`).pipe(
      map((res: any) => {
        const page = unwrapApiList<any>(res);
        return {
          data: page.items.map((user) => mapUserToUi(user, user.roles || [])),
          pagination: page.pagination || {},
        };
      }),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to load users.'))),
    );
  }

  private assignAccountRole(accountId: string, legacyRole: string): Observable<any> {
    const roleKey = mapUiRoleToApiRoleKey(legacyRole);
    return this.getRoleMap().pipe(
      switchMap((roleMap) => {
        const roleId = roleMap.get(roleKey);
        if (!roleId) {
          return throwError(() => `Role "${roleKey}" is not configured in RBAC.`);
        }
        return this._api.post(`v2/rbac/accounts/${accountId}/roles`, { roleId });
      }),
    );
  }

  private syncAccountRole(accountId: string, legacyRole: string, currentRoles: any[] = []): Observable<any> {
    const nextKey = mapUiRoleToApiRoleKey(legacyRole);
    const currentKeys = (currentRoles || [])
      .map((row) => String(row?.role?.key || row?.key || '').toLowerCase())
      .filter(Boolean);

    if (currentKeys.includes(nextKey)) {
      return of(null);
    }

    const removals = (currentRoles || [])
      .filter((row) => row?.role?.id || row?.role_id || row?.roleId)
      .map((row) => this._api.delete(`v2/rbac/accounts/${accountId}/roles/${row.role?.id || row.role_id || row.roleId}`).pipe(
        catchError(() => of(null)),
      ));

    return (removals.length ? forkJoin(removals) : of(null)).pipe(
      switchMap(() => this.assignAccountRole(accountId, legacyRole)),
    );
  }

  addUsers(data: User) {
    const payload = mapUserFormToCreatePayload(data);

    return this._api.post('v2/users', payload).pipe(
      switchMap((res: any) => {
        const created = unwrapApiResponse(res);
        return this.assignAccountRole(created.account_id, data.role).pipe(
          map(() => toItemResponse(
            mapUserToUi(created, [{ key: mapUiRoleToApiRoleKey(data.role) }]),
            'User created successfully',
          )),
        );
      }),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to create user.'))),
    );
  }

  updateUser(userId: string, data: any) {
    const payload = mapUserFormToUpdatePayload(data);

    return this._api.patch(`v2/users/${userId}`, payload).pipe(
      switchMap((res: any) => {
        const updated = unwrapApiResponse(res);
        return this._api.get(`v2/rbac/accounts/${updated.account_id}/roles`).pipe(
          switchMap((rolesRes: any) => {
            const currentRoles = unwrapApiResponse(rolesRes) || [];
            return this.syncAccountRole(updated.account_id, data.role, currentRoles).pipe(
              map(() => toItemResponse(
                mapUserToUi(updated, [{ key: mapUiRoleToApiRoleKey(data.role) }]),
                'User updated successfully',
              )),
            );
          }),
        );
      }),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to update user.'))),
    );
  }

  getUserById(userId: string) {
    return this._api.get(`v2/users/${userId}`).pipe(
      switchMap((res: any) => {
        const user = unwrapApiResponse(res);
        return this._api.get(`v2/rbac/accounts/${user.account_id}/roles`).pipe(
          map((rolesRes: any) => toItemResponse(
            mapUserToUi(user, unwrapApiResponse(rolesRes) || []),
            'User loaded successfully',
          )),
        );
      }),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to load user.'))),
    );
  }

  deleteUser(userId: string) {
    return this._api.delete(`v2/users/${userId}`).pipe(
      map(() => ({ message: 'User deleted successfully' })),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to delete user.'))),
    );
  }

  getMyProfile() {
    return this._api.get('v2/users/me/profile').pipe(
      switchMap((res: any) => {
        const user = unwrapApiResponse(res);
        if (!user?.account_id) {
          return of(toItemResponse(mapUserToUi(user, []), 'Profile loaded successfully'));
        }
        return this._api.get(`v2/rbac/accounts/${user.account_id}/roles`).pipe(
          map((rolesRes: any) => toItemResponse(
            mapUserToUi(user, unwrapApiResponse(rolesRes) || []),
            'Profile loaded successfully',
          )),
          catchError(() => of(toItemResponse(mapUserToUi(user, []), 'Profile loaded successfully'))),
        );
      }),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to load profile.'))),
    );
  }

  updateMyProfile(data: any) {
    const payload = mapUserFormToUpdatePayload(data);
    return this._api.patch('v2/users/me/profile', payload).pipe(
      map((res: any) => toItemResponse(mapUserToUi(unwrapApiResponse(res), []), 'Profile updated successfully')),
      tap(() => this.adminService.invalidateCurrentSession()),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to update profile.'))),
    );
  }

  changeMyPassword(data: any) {
    return this._api.patch('v2/users/me/password', {
      currentPassword: data.currentPassword || data.oldPassword,
      newPassword: data.newPassword || data.password,
    }).pipe(
      map(() => ({ message: 'Password updated successfully' })),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to update password.'))),
    );
  }

  updateUserPassword(userId: number | string, data: any) {
    return this._api.patch(`v2/users/${userId}/password`, {
      password: data.newPassword || data.password,
      must_change_password: Boolean(data.mustChangePassword ?? data.must_change_password),
    }).pipe(
      map(() => ({ message: 'Password updated successfully' })),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to reset password.'))),
    );
  }

  toggleActiveStatus(id: string, data: any) {
    const status = mapUiUserStatusToApi(data?.is_active);

    return this._api.patch(`v2/users/${id}/status`, { status }).pipe(
      switchMap((res: any) => {
        const user = unwrapApiResponse(res);
        return this._api.get(`v2/rbac/accounts/${user.account_id}/roles`).pipe(
          map((rolesRes: any) => ({
            message: 'User status updated successfully',
            data: mapUserToUi(user, unwrapApiResponse(rolesRes) || []),
          })),
          catchError(() => of({
            message: 'User status updated successfully',
            data: mapUserToUi(user, []),
          })),
        );
      }),
      catchError((error: any) => throwError(() => extractApiErrorMessage(error, 'Unable to update user status.'))),
    );
  }
}
