frappe.pages['bloomerang_comparison'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Bloomerang Comparison'),
		single_column: true
	});

	$(frappe.render_template('bloomerang_comparison', {})).appendTo(page.main);

	init_comparison_page(page);
};

function init_comparison_page(page) {
	let $main = $(page.main);
	let $matchList = $main.find('#match-list');
	let $comparisonPane = $main.find('#comparison-pane');
	let $emptyState = $main.find('#empty-state');
	let $comparisonFields = $main.find('#comparison-fields');
	let $btnMerge = $main.find('#btn-merge');
	let $constituentSelect = $main.find('#constituent-select');
	let $btnSearch = $main.find('#btn-search-constituent');

	$btnSearch.on('click', function() {
		let val = $constituentSelect.val().trim();
		if (!val) {
			frappe.msgprint(__('Please enter a Bloomerang ID or Name to search.'));
			return;
		}

		$matchList.html('<div class="p-3 text-center"><i class="fa fa-spinner fa-spin"></i> Searching...</div>');
		$emptyState.hide();
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
							show_comparison(match);
						});
						$matchList.append($item);
					});
				} else {
					$matchList.html('<p class="p-3 text-muted">No matches found.</p>');
				}
			},
			error: function() {
				$matchList.html('<p class="p-3 text-danger">Error finding matches.</p>');
			}
		});
	});

	function show_comparison(match) {
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
					<div class="col-5 field-label">${f.label}</div>
					<div class="col-1 text-center"><i class="fa fa-exchange"></i></div>
					<div class="col-3 text-primary ${isDiff ? 'diff-highlight' : ''}">${valBloo}</div>
					<div class="col-3 text-success ${isDiff ? 'diff-highlight' : ''}">${valErp}</div>
				</div>
			`;
		});

		$comparisonFields.html(html);
	}

	$btnMerge.on('click', function() {
		const activeMatch = $main.find('.match-item.active').first();
		if (!activeMatch.length) {
			frappe.msgprint(__('Please select a match to merge.'));
			return;
		}

		const erpnext_id = activeMatch.data('id');
		const updated_values = {};

		$main.find('.comparison-row').each(function() {
			const label = $(this).find('.field-label').text().trim();
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

		frappe.confirm(`Are you sure you want to merge the selected Bloomerang values into ERPNext contact ${erpnext_id}?`, () => {
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
