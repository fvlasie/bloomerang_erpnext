frappe.pages['bloomerang_import'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Bloomerang Integration',
		single_column: true
	});

	// Render complete self-contained single-page dashboard app HTML into page.main directly
	$(page.main).html(`
		<div class="bloomerang-hub-app p-3">
			<!-- Header / Nav Tabs -->
			<ul class="nav nav-tabs mb-4" id="bloomerang-tabs" role="tablist">
				<li class="nav-item">
					<a class="nav-link active" id="tab-fetch-link" data-toggle="tab" href="#tab-fetch" role="tab">1. Fetch & Stage</a>
				</li>
				<li class="nav-item">
					<a class="nav-link" id="tab-compare-link" data-toggle="tab" href="#tab-compare" role="tab">2. Compare & Merge Records</a>
				</li>
			</ul>

			<!-- Tab Content Containers -->
			<div class="tab-content" id="bloomerang-tab-content">
				<!-- TAB 1: Fetch & Stage -->
				<div class="tab-pane fade show active" id="tab-fetch" role="tabpanel">
					<div class="card p-4">
						<div class="d-flex justify-content-between align-items-center mb-3">
							<h5 class="m-0 font-weight-bold">Bloomerang Data Import</h5>
							<button id="btn-fetch-constituents" class="btn btn-primary btn-sm">
								<i class="fa fa-refresh mr-1"></i> Fetch Constituents
							</button>
						</div>
						<div id="bloomerang-status" class="text-muted small">Click "Fetch Constituents" to connect to Bloomerang and pull records.</div>
						<div id="bloomerang-table-container" class="mt-3"></div>
					</div>
				</div>

				<!-- TAB 2: Compare & Merge -->
				<div class="tab-pane fade" id="tab-compare" role="tabpanel">
					<div class="row">
						<div class="col-md-4">
							<div class="card">
								<div class="card-header bg-light">
									<strong>Search Bloomerang Records</strong>
								</div>
								<div class="card-body p-3">
									<div class="form-group mb-3">
										<label class="small text-muted mb-1">Search by Constituent ID or Name</label>
										<div class="input-group">
											<input type="text" id="constituent-search-input" class="form-control form-control-sm" placeholder="e.g. 101 or Smith">
											<div class="input-group-append">
												<button class="btn btn-primary btn-sm" id="btn-search-constituent">Search</button>
											</div>
										</div>
									</div>
									<div id="match-list" class="list-group mt-3">
										<p class="text-muted small p-2">Search for a record above to find potential ERPNext matches.</p>
									</div>
								</div>
							</div>
						</div>

						<div class="col-md-8">
							<div id="comparison-pane" class="card" style="display: none;">
								<div class="card-header bg-light d-flex justify-content-between align-items-center">
									<strong>Record Comparison</strong>
									<button id="btn-merge" class="btn btn-success btn-sm">Execute Merge into ERPNext</button>
								</div>
								<div class="card-body p-4">
									<div class="row text-center mb-3">
										<div class="col-6">
											<h6 class="text-primary font-weight-bold mb-0">Bloomerang (Incoming)</h6>
										</div>
										<div class="col-6">
											<h6 class="text-success font-weight-bold mb-0">ERPNext (Target Contact)</h6>
										</div>
									</div>
									<hr class="mt-2 mb-3">
									<div id="comparison-fields"></div>
								</div>
							</div>
							<div id="empty-state" class="text-center py-5 border rounded bg-light">
								<i class="fa fa-exchange text-muted mb-2" style="font-size: 36px;"></i>
								<p class="text-muted mb-0">Select a record from the search list to display the comparison view.</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<style>
			.bloomerang-hub-app .diff-highlight {
				background-color: #fff3cd;
				border-radius: 4px;
				padding: 2px 6px;
			}
			.bloomerang-hub-app .match-item {
				cursor: pointer;
			}
			.bloomerang-hub-app .match-item:hover {
				background-color: #f8f9fa;
			}
			.bloomerang-hub-app .match-item.active {
				background-color: #e7f1ff;
				border-left: 4px solid #007bff;
			}
			.bloomerang-hub-app .comparison-row {
				padding: 8px 0;
				border-bottom: 1px solid #f0f0f0;
			}
		</style>
	`);

	// Attach Page Header Primary Action
	page.set_primary_action('Fetch Constituents', function() {
		fetchBloomerangData(page);
	}, 'octicon octicon-sync');

	// Tab switching event handlers
	$(page.main).find('#bloomerang-tabs a').on('click', function (e) {
		e.preventDefault();
		$(this).tab('show');
	});

	// Fetch constituents handler
	$(page.main).find('#btn-fetch-constituents').on('click', function() {
		fetchBloomerangData(page);
	});

	// Initialize search and comparison handlers
	initComparisonHandlers(page);
};

function fetchBloomerangData(page) {
	let $main = $(page.main);
	let $status = $main.find('#bloomerang-status');
	let $container = $main.find('#bloomerang-table-container');

	$status.text('Fetching records from Bloomerang...');
	$container.empty();

	frappe.call({
		method: 'bloomerang_erpnext.api.fetch_constituents',
		error: function(r) {
			$status.html(`<details><summary class="text-danger">View Raw Error</summary><pre class="text-danger">${JSON.stringify(r, null, 2)}</pre></details>`);
		},
		callback: function(r) {
			if (r.message && r.message.error) {
				$status.html(`<details><summary class="text-danger">View Raw Error</summary><pre class="text-danger">${JSON.stringify(r.message, null, 2)}</pre></details>`);
				return;
			}

			if (!r.message || !r.message.Results) {
				$status.html(`<details><summary class="text-danger">View Raw Error</summary><pre class="text-danger">No data returned or invalid API credentials. Full response: ${JSON.stringify(r, null, 2)}</pre></details>`);
				return;
			}

			$status.html(`Loaded ${r.message.Results.length} constituents. <details><summary>View Raw Response</summary><pre>${JSON.stringify(r, null, 2)}</pre></details>`);
			renderTable($container, r.message.Results);
		}
	});
}

function renderTable($container, items) {
	let rows = items.map(c => `
		<tr>
			<td><b>${c.Id || ''}</b></td>
			<td>${c.Type || ''}</td>
			<td>${c.FirstName || ''} ${c.LastName || c.FullName || ''}</td>
			<td>${c.PrimaryEmail ? c.PrimaryEmail.Value : '-'}</td>
			<td>${c.PrimaryPhone ? c.PrimaryPhone.Number : '-'}</td>
		</tr>
	`).join('');

	$container.html(`
		<table class="table table-bordered table-hover mt-3">
			<thead class="thead-light">
				<tr>
					<th>Bloomerang ID</th>
					<th>Type</th>
					<th>Name</th>
					<th>Email</th>
					<th>Phone</th>
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
	`);
}

function initComparisonHandlers(page) {
	let $main = $(page.main);
	let $matchList = $main.find('#match-list');
	let $comparisonPane = $main.find('#comparison-pane');
	let $emptyState = $main.find('#empty-state');
	let $comparisonFields = $main.find('#comparison-fields');
	let $btnMerge = $main.find('#btn-merge');
	let $searchInput = $main.find('#constituent-search-input');
	let $btnSearch = $main.find('#btn-search-constituent');

	$btnSearch.on('click', function() {
		let val = $searchInput.val().trim();
		if (!val) {
			frappe.msgprint('Please enter a Bloomerang ID or Name to search.');
			return;
		}

		$matchList.html('<div class="p-3 text-center text-muted"><i class="fa fa-spinner fa-spin mr-1"></i> Searching...</div>');
		$emptyState.show();
		$comparisonPane.hide();

		frappe.call({
			method: 'bloomerang_erpnext.api.find_potential_matches',
			args: {
				bloomerang_constituent_id: val
			},
			callback: function(r) {
				$matchList.empty();
				if (r.message && r.message.matches && r.message.matches.length > 0) {
					r.message.matches.forEach(match => {
						let $item = $(`
							<div class="list-group-item match-item" data-id="${match.erpnext_id}" data-type="${match.type}">
								<strong>${match.type}</strong><br>
								<small>${match.details ? (match.details.full_name || match.details.name) : ''}</small><br>
								<small class="text-muted">${match.details ? (match.details.email_id || '') : ''}</small>
							</div>
						`);
						$item.on('click', function() {
							$main.find('.match-item').removeClass('active');
							$(this).addClass('active');
							showComparison(match);
						});
						$matchList.append($item);
					});
				} else {
					$matchList.html('<p class="p-3 text-muted">No matches found.</p>');
				}
			},
			error: function() {
				$matchList.html('<p class="p-3 text-danger">Error searching matches.</p>');
			}
		});
	});

	function showComparison(match) {
		$emptyState.hide();
		$comparisonPane.show();

		const bloo = match.bloomerang_data || {};
		const erp = match.erpnext_data || {};

		let html = '';
		const fields = [
			{ label: 'Full Name', bloo: 'full_name', erp: 'full_name' },
			{ label: 'Email', bloo: 'email_id', erp: 'email_id' },
			{ label: 'Phone', bloo: 'phone', erp: 'phone' }
		];

		fields.forEach(f => {
			const valBloo = bloo[f.bloo] || '-';
			const valErp = erp[f.erp] || '-';
			const isDiff = valBloo !== valErp;

			html += `
				<div class="row comparison-row align-items-center">
					<div class="col-4 font-weight-bold text-muted">${f.label}</div>
					<div class="col-1 text-center"><i class="fa fa-arrow-right text-muted"></i></div>
					<div class="col-3 text-primary ${isDiff ? 'diff-highlight' : ''}">${valBloo}</div>
					<div class="col-4 text-success ${isDiff ? 'diff-highlight' : ''}">${valErp}</div>
				</div>
			`;
		});

		$comparisonFields.html(html);
	}

	$btnMerge.on('click', function() {
		const activeMatch = $main.find('.match-item.active').first();
		if (!activeMatch.length) {
			frappe.msgprint('Please select a match to merge.');
			return;
		}

		const erpnext_id = activeMatch.data('id');
		const updated_values = {};

		$main.find('.comparison-row').each(function() {
			const label = $(this).find('.col-4').text().trim();
			const valBloo = $(this).find('.text-primary').text().trim();

			const field_map = {
				'Full Name': 'full_name',
				'Email': 'email_id',
				'Phone': 'phone'
			};

			if (field_map[label]) {
				updated_values[field_map[label]] = valBloo;
			}
		});

		frappe.confirm(`Are you sure you want to merge Bloomerang data into ERPNext Contact ${erpnext_id}?`, () => {
			frappe.call({
				method: 'bloomerang_erpnext.api.execute_merge',
				args: {
					erpnext_id: erpnext_id,
					updated_values: updated_values
				},
				callback: function(r) {
					if (r.message && r.message.status === 'success') {
						frappe.show_alert({message: r.message.message, indicator: 'green'});
					} else if (r.message && r.message.error) {
						frappe.msgprint({
							title: 'Merge Error',
							message: r.message.error,
							indicator: 'red'
						});
					}
				}
			});
		});
	});
}
