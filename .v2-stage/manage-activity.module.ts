import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ManageActivityRoutingModule } from './manage-activity-routing.module';
import { CoreModule } from '../../core/core.module';
import { SharedModule } from 'src/app/modules/shared/shared.module';
import { ViewTimesheetComponent } from './view-timesheet/view-timesheet.component';
import { ManageActivityLayoutComponent } from './components/manage-activity-layout/manage-activity-layout.component';
import { TeamActivityComponent } from './team-activity/team-activity.component';
import { OrderModule } from 'ngx-order-pipe';
import { PopupModule } from '../../shared/popup/popup.module';
import { NgxPaginationModule } from 'ngx-pagination';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { WorkforceReportsV2Component } from './workforce-reports-v2/workforce-reports-v2.component';
import { WorkforceDateRangeFilterComponent } from './workforce-reports-v2/workforce-date-range-filter.component';
import { WorkforceEmployeeDirectoryComponent } from './workforce-reports-v2/workforce-employee-directory.component';
@NgModule({
  declarations: [
    ViewTimesheetComponent, ManageActivityLayoutComponent, TeamActivityComponent,
    WorkforceReportsV2Component, WorkforceDateRangeFilterComponent, WorkforceEmployeeDirectoryComponent
  ],
  imports: [
    
    OrderModule,
    NgxPaginationModule,
    PopupModule,
    FormsModule,
    NgSelectModule,
    CommonModule,
    ManageActivityRoutingModule,CoreModule,SharedModule
  ]
})
export class ManageActivityModule { }
