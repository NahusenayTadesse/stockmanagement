/**
 * The admin-kit's words in the viewer's language: its components' labels (`setKitLabels` in the
 * root layout) and its server messages (`configureKit({ labels })` in hooks.server.ts).
 *
 * `kitLabels()` and `kitServerLabels()` are called at render and per message, and return the
 * table for the language of that render or request.
 */
import type { KitLabels } from '@nahu/admin-kit/labels';
import type { ServerLabels } from '@nahu/admin-kit/server/labels';
import { m } from '$lib/paraglide/messages.js';
import { getLocale, type Locale } from '$lib/paraglide/runtime';

/**
 * Built once per language and kept: the labels depend on nothing but the language (no viewer,
 * no request data), and the kit reads them on every label it renders. Each table is built with
 * its locale passed explicitly, so it can never be filled in some other request's language.
 */
const clientCache = new Map<Locale, KitLabels>();
const serverCache = new Map<Locale, ServerLabels>();

export function kitLabels(): KitLabels {
	const locale = getLocale();
	let labels = clientCache.get(locale);
	if (!labels) {
		labels = buildKitLabels(locale);
		clientCache.set(locale, labels);
	}
	return labels;
}

export function kitServerLabels(): ServerLabels {
	const locale = getLocale();
	let labels = serverCache.get(locale);
	if (!labels) {
		labels = buildServerLabels(locale);
		serverCache.set(locale, labels);
	}
	return labels;
}

function buildKitLabels(locale: Locale): KitLabels {
	const o = { locale };
	return {
		tableSearch: m.kit_table_search({}, o),
		tableSearchServer: m.kit_table_search_server({}, o),
		tableColumns: m.kit_table_columns({}, o),
		tableClear: (count) => m.kit_table_clear({ count }, o),
		tableCharts: m.kit_table_charts({}, o),
		tableResults: (count) => m.kit_table_results({ count }, o),
		tableEmpty: m.kit_table_empty({}, o),
		tablePrint: m.kit_table_print({}, o),
		tableExportCsv: m.kit_table_export_csv({}, o),
		tablePrinted: (when, rows) => m.kit_table_printed({ when, rows }, o),
		pagerNoRows: m.kit_pager_no_rows({}, o),
		pagerRange: (first, last, total) => m.kit_pager_range({ first, last, total }, o),
		pagerRowsPerPage: m.kit_pager_rows_per_page({}, o),
		pagerPage: (page, pages) => m.kit_pager_page({ page, pages }, o),
		pagerPrevious: m.kit_pager_previous({}, o),
		pagerNext: m.kit_pager_next({}, o),
		facetFilterBy: (label) => m.kit_facet_filter_by({ label }, o),
		facetFilterPlaceholder: (label) =>
			m.kit_facet_filter_placeholder({ label: label.toLowerCase() }, o),
		facetNoValues: m.kit_facet_no_values({}, o),
		facetClear: (label) => m.kit_facet_clear({ label: label.toLowerCase() }, o),
		facetSummary: (rows, values) =>
			values === 1
				? m.kit_facet_summary_one({ rows, values }, o)
				: m.kit_facet_summary({ rows, values }, o),
		dateToday: m.kit_date_today({}, o),
		dateLast7: m.kit_date_last7({}, o),
		dateLast30: m.kit_date_last30({}, o),
		dateLast90: m.kit_date_last90({}, o),
		dateLast12Months: m.kit_date_last12_months({}, o),
		dateClear: m.kit_date_clear({}, o),
		dateApply: m.kit_date_apply({}, o),
		dateClearAria: (label) => m.kit_date_clear_aria({ label }, o),
		chartType: m.kit_chart_type({}, o),
		chartBar: m.kit_chart_bar({}, o),
		chartPie: m.kit_chart_pie({}, o),
		chartDoughnut: m.kit_chart_doughnut({}, o),
		chartLine: m.kit_chart_line({}, o),
		chartPolarArea: m.kit_chart_polar_area({}, o),
		chartRadar: m.kit_chart_radar({}, o),
		chartBreakdown: (label) => m.kit_chart_breakdown({ label }, o),
		chartFilteredBy: m.kit_chart_filtered_by({}, o),
		goTo: (name) => m.kit_go_to({ name }, o),
		expired: (date) => m.kit_expired({ date }, o),
		daysLeft: (days, date) => m.kit_days_left({ days, date }, o),
		noExpiry: m.kit_no_expiry({}, o),
		addressDetails: m.kit_address_details({}, o),
		addressNone: m.kit_address_none({}, o),
		addressMap: m.kit_address_map({}, o),
		addressSubcity: m.kit_address_subcity({}, o),
		addressStreet: m.kit_address_street({}, o),
		addressKebele: m.kit_address_kebele({}, o),
		addressBuilding: m.kit_address_building({}, o),
		addressFloor: m.kit_address_floor({}, o),
		addressHouse: m.kit_address_house({}, o),
		lookupAdd: (entity) => m.kit_lookup_add({ entity }, o),
		lookupAddNewTitle: (entity) => m.kit_lookup_add_new_title({ entity }, o),
		lookupAddTitle: (entity) => m.kit_lookup_add_title({ entity }, o),
		lookupAdding: (entity) => m.kit_lookup_adding({ entity }, o),
		lookupEdit: m.kit_lookup_edit({}, o),
		lookupEditTitle: (title) => m.kit_lookup_edit_title({ title }, o),
		lookupSaveChanges: m.kit_lookup_save_changes({}, o),
		lookupSavingChanges: m.kit_lookup_saving_changes({}, o),
		lookupActive: m.kit_lookup_active({}, o),
		lookupInactive: m.kit_lookup_inactive({}, o),
		deleteTitle: (entity) => m.kit_delete_title({ entity }, o),
		deleteAria: (entity, name) =>
			name ? m.kit_delete_aria({ entity, name }, o) : m.kit_delete_title({ entity }, o),
		deleteQuestion: (entity) => m.kit_delete_question({ entity: entity.toLowerCase() }, o),
		deleteNamedWarning: m.kit_delete_named_warning({}, o),
		deleteWarning: (entity) => m.kit_delete_warning({ entity: entity.toLowerCase() }, o),
		deleteButton: (entity) => m.kit_delete_title({ entity }, o),
		deleting: (entity) => m.kit_deleting({ entity }, o),
		cancel: m.kit_cancel({}, o),
		keepIt: m.kit_keep_it({}, o),
		reportShowChart: m.kit_report_show_chart({}, o),
		reportShowTable: m.kit_report_show_table({}, o),
		reportEmpty: m.kit_report_empty({}, o),
		reportChartAria: (title) => m.kit_report_chart_aria({ title }, o),
		statHours: (value) => m.kit_stat_hours({ value }, o),
		statYears: (value) => m.kit_stat_years({ value }, o),
		statDays: (value) => m.kit_stat_days({ value }, o),
		searchTitle: m.kit_search_title({}, o),
		searchButton: m.kit_search_button({}, o),
		searchPlaceholder: m.kit_search_placeholder({}, o),
		searchEmpty: m.kit_search_empty({}, o),
		searchSuggestions: m.kit_search_suggestions({}, o),
		themeToggle: m.kit_theme_toggle({}, o),
		themeLight: m.kit_theme_light({}, o),
		themeDark: m.kit_theme_dark({}, o),
		themeSystem: m.kit_theme_system({}, o),
		toggleSidebar: m.kit_toggle_sidebar({}, o),
		sidebar: m.kit_sidebar({}, o),
		sidebarDescription: m.kit_sidebar_description({}, o),
		close: m.kit_close({}, o),
		print: m.kit_print({}, o),
		tel: (phone) => m.kit_tel({ phone }, o),
		loading: m.kit_loading({}, o),
		loadingNamed: (name) => m.kit_loading_named({ name }, o),
		detail: m.kit_detail({}, o),
		value: m.kit_value({}, o),
		notFound: (title) => m.kit_not_found({ title }, o),
		copy: (text) => m.kit_copy({ text }, o),
		copied: m.kit_copied({}, o),
		copyFailed: m.kit_copy_failed({}, o),
		fixTheFollowing: m.kit_fix_the_following({}, o),
		select: (what) => m.kit_select({ what }, o),
		searchFor: (what) => m.kit_search_for({ what }, o),
		noneFound: (what) => m.kit_none_found({ what }, o),
		selectAll: m.kit_select_all({}, o),
		ethiopianDate: m.kit_ethiopian_date({}, o),
		bigTextShowAll: m.kit_big_text_show_all({}, o),
		dateLocale: m.kit_date_locale({}, o),
		calendarEthiopian: m.kit_calendar_ethiopian({}, o),
		calendarGregorian: m.kit_calendar_gregorian({}, o),
		calendarEthiopianShort: m.kit_calendar_ethiopian_short({}, o),
		calendarGregorianShort: m.kit_calendar_gregorian_short({}, o),
		calendarSwitch: m.kit_calendar_switch({}, o),
		dateDay: m.kit_date_day({}, o),
		dateMonth: m.kit_date_month({}, o),
		dateYear: m.kit_date_year({}, o),
		dateNoSuchDay: m.kit_date_no_such_day({}, o),
		dateOutOfRange: m.kit_date_out_of_range({}, o),
		dateSameAs: (date, calendar) => m.kit_date_same_as({ date, calendar }, o),
		dateTomorrow: m.kit_date_tomorrow({}, o),
		dateIn3Days: m.kit_date_in_3_days({}, o),
		dateInAWeek: m.kit_date_in_a_week({}, o),
		dateIn2Weeks: m.kit_date_in_2_weeks({}, o),
		dateStart: m.kit_date_start({}, o),
		dateEnd: m.kit_date_end({}, o),
		pickADate: m.kit_pick_adate({}, o),
		notSet: m.kit_not_set({}, o),
		clear: m.kit_clear({}, o),
		filter: m.kit_filter({}, o),
		to: m.kit_to({}, o),
		todayOnly: m.kit_today_only({}, o),
		clearAll: m.kit_clear_all({}, o),
		datesSelected: (count) => m.kit_dates_selected({ count }, o),
		selectDates: m.kit_select_dates({}, o),
		noDatesSelected: m.kit_no_dates_selected({}, o),
		selectMonthYear: m.kit_select_month_year({}, o),
		saveChanges: m.kit_save_changes({}, o),
		showPassword: m.kit_show_password({}, o),
		hidePassword: m.kit_hide_password({}, o),
		saving: m.kit_saving({}, o),
		uploadPrompt: m.kit_upload_prompt({}, o),
		uploadDropHere: m.kit_upload_drop_here({}, o),
		uploadOptimizing: m.kit_upload_optimizing({}, o),
		uploadHint: m.kit_upload_hint({}, o),
		uploadOptimized: m.kit_upload_optimized({}, o),
		preview: m.kit_preview({}, o),
		riskConfirm: m.kit_risk_confirm({}, o),
		riskCheckFirst: m.kit_risk_check_first({}, o),
		leaveUnsaved: m.kit_leave_unsaved({}, o),
		pwTitle: m.kit_pw_title({}, o),
		pwHeading: m.kit_pw_heading({}, o),
		pwDescription: m.kit_pw_description({}, o),
		pwGenerated: m.kit_pw_generated({}, o),
		pwStrength: m.kit_pw_strength({}, o),
		pwWeak: m.kit_pw_weak({}, o),
		pwFair: m.kit_pw_fair({}, o),
		pwGood: m.kit_pw_good({}, o),
		pwStrong: m.kit_pw_strong({}, o),
		pwLength: m.kit_pw_length({}, o),
		pwCharacterTypes: m.kit_pw_character_types({}, o),
		pwPickOne: m.kit_pw_pick_one({}, o),
		pwUppercase: m.kit_pw_uppercase({}, o),
		pwLowercase: m.kit_pw_lowercase({}, o),
		pwNumbers: m.kit_pw_numbers({}, o),
		pwSymbols: m.kit_pw_symbols({}, o),
		pwGenerateNew: m.kit_pw_generate_new({}, o),
		pwGenerating: m.kit_pw_generating({}, o),
		pwGenerateFirst: m.kit_pw_generate_first({}, o),
		pwCopied: m.kit_pw_copied({}, o),
		pwCopyFailed: m.kit_pw_copy_failed({}, o),
		qbTitle: m.kit_qb_title({}, o),
		qbDescription: m.kit_qb_description({}, o),
		qbSearchRows: m.kit_qb_search_rows({}, o),
		qbResults: (count) =>
			count === 1
				? m.kit_qb_results_one({ count: count.toLocaleString() }, o)
				: m.kit_qb_results({ count: count.toLocaleString() }, o),
		qbHide: m.kit_qb_hide({}, o),
		qbClearAll: m.kit_qb_clear_all({}, o),
		qbSearch: m.kit_qb_search({}, o),
		qbPageSize: m.kit_qb_page_size({}, o),
		qbPerPage: (count) => m.kit_qb_per_page({ count }, o),
		qbDateRange: m.kit_qb_date_range({}, o),
		qbNoFilterUi: m.kit_qb_no_filter_ui({}, o),
		fmTitle: m.kit_fm_title({}, o),
		fmDescription: m.kit_fm_description({}, o),
		fmFilters: m.kit_fm_filters({}, o),
		fmActive: (count) => m.kit_fm_active({ count }, o),
		fmReset: m.kit_fm_reset({}, o),
		fmResetDone: m.kit_fm_reset_done({}, o),
		fmAll: (what) => m.kit_fm_all({ what }, o),
		fmSelected: (count) => m.kit_fm_selected({ count }, o),
		fmShowing: m.kit_fm_showing({}, o),
		fmOf: m.kit_fm_of({}, o),
		fmRecords: m.kit_fm_records({}, o),
		fmChartType: m.kit_fm_chart_type({}, o),
		fmHighlighted: (count) =>
			count > 1 ? m.kit_fm_highlighted({ count }, o) : m.kit_fm_highlighted_one({ count }, o),
		fmItems: (label, count) => m.kit_fm_items({ label, count }, o),
		fmClickBar: m.kit_fm_click_bar({}, o),
		fmClickSegment: m.kit_fm_click_segment({}, o),
		fmSearch: (what) => m.kit_fm_search({ what }, o),
		fmActiveFilters: (count) =>
			count > 1 ? m.kit_fm_active_filters({ count }, o) : m.kit_fm_active_filters_one({ count }, o),
		fmDistribution: (what, records) =>
			records !== 1
				? m.kit_fm_distribution({ what, records }, o)
				: m.kit_fm_distribution_one({ what, records }, o)
	};
}

function buildServerLabels(locale: Locale): ServerLabels {
	const o = { locale };
	return {
		crudAdded: (label) => m.kit_srv_crud_added({ label }, o),
		crudUpdated: (label) => m.kit_srv_crud_updated({ label }, o),
		crudDeleted: (label) => m.kit_srv_crud_deleted({ label }, o),
		crudCouldNotAdd: (label) => m.kit_srv_crud_could_not_add({ label }, o),
		crudCouldNotUpdate: (label) => m.kit_srv_crud_could_not_update({ label }, o),
		crudCouldNotDelete: (label) => m.kit_srv_crud_could_not_delete({ label }, o),
		crudCheckForm: m.kit_srv_crud_check_form({}, o),
		crudInvalidRequest: m.kit_srv_crud_invalid_request({}, o),
		crudExists: (label) => m.kit_srv_crud_exists({ label: label.toLowerCase() }, o),
		crudGone: (label) => m.kit_srv_crud_gone({ label: label.toLowerCase() }, o),
		lookupNoneSelected: (label) => m.kit_srv_lookup_none_selected({ label }, o),
		lookupNotFound: (label) => m.kit_srv_lookup_not_found({ label }, o),
		lookupDeleted: (label) => m.kit_srv_lookup_deleted({ label }, o),
		lookupCouldNotDelete: (label, reason) =>
			m.kit_srv_lookup_could_not_delete({ label, reason }, o),
		unknownError: m.kit_srv_unknown_error({}, o),
		noFile: m.kit_srv_no_file({}, o),
		fileTooLarge: (megabytes) => m.kit_srv_file_too_large({ megabytes }, o),
		fileTypeRefused: m.kit_srv_file_type_refused({}, o),
		noPermission: m.kit_srv_no_permission({}, o),
		superAdminOnly: m.kit_srv_super_admin_only({}, o),
		notFound: m.kit_srv_not_found({}, o)
	};
}
