import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';
import { utilityService } from '../../services/utility.service';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ModuleStatusService } from '../../services/module-status.service';
import { ConverseStateService } from 'src/app/modules/features/converse/services/converse-state.service';
import { ActivityTimerService } from '../../services/activity-timer.service';
import { TaskService } from 'src/app/modules/features/task/services/task.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent implements OnInit, OnDestroy {
  title = environment.title;
  role: string | null = null;
  user: any;
  isScrolled = false;
  isLoad: boolean = false;
  navArr: any[] = [];
  activeDropdown: string | null = null;
  converseUnread = 0;
  taskUnread = 0;

  private unreadSub = new Subscription();

  constructor(
    private utility: utilityService,
    private router: Router,
    private moduleStatus: ModuleStatusService,
    private converseState: ConverseStateService,
    private task: TaskService,
    private activityTimer: ActivityTimerService,
  ) { }

  async ngOnInit(): Promise<void> {
    await this.initializeUser();

    this.unreadSub.add(this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.activeDropdown = null;
      }));

    this.unreadSub.add(this.moduleStatus.modules$.subscribe(() => {
      this.navArr = this.getNavItems();
    }));

    this.moduleStatus.loadModules().subscribe({
      next: () => {
        this.navArr = this.getNavItems();
      },
      error: () => undefined,
    });

    if (this.role !== 'client') {
      this.task.refreshNotificationUnread();
    }
    this.unreadSub.add(
      this.converseState.unreadCounts$.subscribe((counts) => {
        if (!this.utility.hasModule('converse')) {
          this.converseUnread = 0;
          return;
        }
        this.converseUnread = Object.values(counts).reduce((sum, n) => sum + n, 0);
      }),
    );
    this.unreadSub.add(
      this.task.notificationUnread$.subscribe((count) => {
        this.taskUnread = count;
      }),
    );
  }

  ngOnDestroy(): void {
    this.unreadSub.unsubscribe();
  }

  @HostListener('window:scroll', [])
  onScroll(): void {
    this.isScrolled = window.scrollY > 50;
  }

  async initializeUser(): Promise<void> {
    await this.refreshNavContext();

    this.unreadSub.add(this.utility.userLoggedObs.subscribe((loggedIn) => {
      if (loggedIn) {
        void this.refreshNavContext();
      }
    }));

    this.unreadSub.add(this.utility.accessState$.subscribe(() => {
      this.navArr = this.getNavItems();
    }));
  }

  getNavItems(): any[] {
    if (!this.role) return [];
    const adminNav: any[] = [
      { label: 'Dashboard', icon: 'ri-dashboard-line', link: '/admin', module: 'dashboard' },
      { label: 'Users', icon: 'ri-user-3-line', link: '/admin/user/all-user', module: 'employees' },
      { label: 'Clients', icon: 'ri-group-line', link: '/admin/client/all-clients', module: 'clients' },
      {
        label: 'Projects',
        icon: 'ri-folder-3-line',
        module: 'projects',
        children: [
          { label: 'Projects List', icon: 'ri-list-unordered', link: '/admin/projects/all-projects' },
          { label: 'Add New', icon: 'ri-add-line', link: '/admin/projects/add-new' },
        ],
      },
      { label: 'Tasks', icon: 'ri-task-line', link: '/tasks', module: 'tasks', key: 'tasks' },
      { label: 'Converse', icon: 'ri-chat-3-line', link: '/converse', module: 'converse', key: 'converse' },
      { label: 'DiscussFlow AI', icon: 'ri-brain-line', link: '/admin/discuss-flow', module: 'discuss_flow', key: 'discuss_flow' },
      { label: 'My Day', icon: 'ri-sun-foggy-line', link: '/my-day', module: 'daily_flow', key: 'daily_flow' },
      { label: 'Activity', icon: 'ri-task-line', link: '/admin/manage-activity/workforce-reports-v2', module: 'activity' },
    ];

    const userNav: any[] = [
      { label: 'Dashboard', icon: 'ri-dashboard-line', link: '/user', module: 'dashboard' },
      { label: 'Projects List', icon: 'ri-list-unordered', link: '/user/all-projects', module: 'projects' },
      {
        label: 'Activity',
        icon: 'ri-bar-chart-line',
        module: 'activity',
        children: [
          { label: 'Clock Activity', icon: 'ri-timer-line', link: '/user/time-tracking', module: 'clock_activity' },
          { label: 'Add Activity', icon: 'ri-add-circle-line', link: '/user/activity/add-activity', module: 'activity' },
          { label: 'View Activity', icon: 'ri-eye-line', link: '/user/activity/my-activity', module: 'activity' },
        ],
      },
      { label: 'Tasks', icon: 'ri-task-line', link: '/tasks/inbox', module: 'tasks', key: 'tasks' },
      { label: 'Converse', icon: 'ri-chat-3-line', link: '/converse', module: 'converse', key: 'converse' },
      { label: 'My Day', icon: 'ri-sun-foggy-line', link: '/my-day', module: 'daily_flow', key: 'daily_flow' },
    ];

    if (this.role === 'client') {
      this.isLoad = true;
      return [
        { label: 'Tasks', icon: 'ri-task-line', link: '/tasks', module: 'tasks', key: 'tasks' },
      ].filter((item) => this.canShowModule(item.module));
    }

    this.isLoad = true;
    const source = this.role === 'super-admin' ? adminNav : userNav;
    return source
      .filter(item => !item.superAdminOnly || this.isSuperAdminOnly())
      .map(item => this.prepareNavItem(item))
      .filter(item => item !== null) as any[];
  }

  private prepareNavItem(item: any): any | null {
    if (item.children?.length) {
      const children = item.children.filter((child: any) => this.canShowModule(child.module || item.module));
      if (!this.canShowModule(item.module) || !children.length) {
        return null;
      }
      return { ...item, children };
    }
    if (!this.canShowModule(item.module)) {
      return null;
    }
    return item;
  }

  canShowModule(moduleKey?: string): boolean {
    if (!moduleKey) return true;
    if (moduleKey === 'converse') {
      return this.utility.hasModule('converse') && this.moduleStatus.isEnabled('converse');
    }
    if (moduleKey === 'discuss_flow') {
      return this.utility.hasModule('discuss_flow') && this.moduleStatus.isEnabled('discuss_flow');
    }
    if (moduleKey === 'clock_activity') {
      return this.utility.hasModule('activity')
        && this.utility.hasModule('clock_activity')
        && this.moduleStatus.isEnabled('clock_activity');
    }
    if (moduleKey === 'activity') {
      return this.utility.hasModule('activity');
    }
    return this.utility.hasModule(moduleKey);
  }

  private async refreshNavContext(): Promise<void> {
    this.role = await this.utility.getUserRole();
    this.user = this.utility.UserAuthData?.user || null;
    this.navArr = this.getNavItems();
  }

  get logoRouterLink(): string | null {
    if (this.role === 'client') return '/tasks';
    if (this.role === 'super-admin') return '/admin';
    if (this.role === 'manager' || this.role === 'employee' || this.role === 'user') {
      return this.role === 'manager' ? '/tasks' : '/user';
    }
    return null;
  }

  get userDisplayName(): string {
    return this.utility.getSessionDisplayName() || 'Account';
  }

  get userInitials(): string {
    const name = this.userDisplayName;
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0].toUpperCase()).join('') || '?';
  }

  isClientPortal(): boolean {
    return this.role === 'client' || this.utility.isClientUser();
  }

  logout(): void {
    this.activityTimer.handleLogout().subscribe((canLogout) => {
      if (!canLogout) return;
      this.activityTimer.teardown();
      this.utility.logoutUser();
    });
  }

  isEmployee(): boolean {
    return this.role === 'employee';
  }

  isAdmin(): boolean {
    return this.role === 'super-admin';
  }

  isSuperAdminOnly(): boolean {
    const roles = this.utility.accessState.value.roles || [];
    if (roles.length) return roles.some(role => String(role).toUpperCase() === 'SUPER_ADMIN');

    const decodedRoles = this.utility.getDecodedAuth()?.user?.roles || [];
    if (decodedRoles.length) return decodedRoles.some((role: string) => String(role).toUpperCase() === 'SUPER_ADMIN');

    return this.role === 'super-admin';
  }

  toggleDropdown(label: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.activeDropdown = this.activeDropdown === label ? null : label;
  }

  isDropdownOpen(label: string): boolean {
    return this.activeDropdown === label;
  }
}
