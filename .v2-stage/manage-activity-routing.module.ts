import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ViewTimesheetComponent } from './view-timesheet/view-timesheet.component'
import { ManageActivityLayoutComponent } from './components/manage-activity-layout/manage-activity-layout.component';
import { TeamActivityComponent } from './team-activity/team-activity.component';
import { WorkforceReportsV2Component } from './workforce-reports-v2/workforce-reports-v2.component';
import { RoleGuard } from '../../shared/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: ManageActivityLayoutComponent,
    children: [
      { path: '', redirectTo: 'team-activity', pathMatch: 'full' },
      { path: 'team-activity', component: TeamActivityComponent },
      { path: 'view-activity', component: ViewTimesheetComponent },
      { path: 'workforce-reports-v2', component: WorkforceReportsV2Component, canActivate: [RoleGuard], data: { roles: ['super-admin'] } },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ManageActivityRoutingModule { }
