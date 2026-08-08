frappe.pages['bloomerang_comparison'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Bloomerang Comparison',
        single_column: true
    });

    $(page.main).html(`
        <div class="nav nav-tabs mb-4" style="border-bottom: 1px solid #d1d8dd;">
            <a class="nav-link" href="#" onclick="frappe.set_route('bloomerang_import'); return false;">1. Fetch & Stage</a>
            <a class="nav-link active" href="#" onclick="frappe.set_route('bloomerang_comparison'); return false;">2. Compare & Merge</a>
        </div>
        <div class="bloomerang-comparison-container">
            <div class="row mb-4">
                <div class="col-md-12">
                    <h4 class="page-title">Bloomerang vs ERPNext Comparison</h4>
                    <div class="row align-items-end mt-3">
                        <div class="col-md-6">
                            <label for="constituent-select">Select Bloomerang Constituent to Compare:</label>
                            <div class="input-group">
                                <input type="text" id="constituent-select" class="form-control" placeholder="Search by ID or Name...">
                                <div class="input-group-append">
                                    <button class="btn btn-primary" id="btn-search-constituent">Search</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header">Potential Matches</div>
                        <div class="card-body">
                            <div id="match-list" class="list-group">
                                <p class="text-muted">No matches selected.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <div id="comparison-pane" class="card" style="display: none;">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <span>Comparison View</span>
                            <button id="btn-merge" class="btn btn-primary btn-sm">Execute Merge</button>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-6">
                                    <h5 class="text-primary">Bloomerang</h5>
                                </div>
                                <div class="col-6">
                                    <h5 class="text-success">ERPNext</h5>
                                </div>
                            </div>
                            <hr>
                            <div id="comparison-fields"></div>
                        </div>
                    </div>
                    <div id="empty-state" class="text-center mt-5">
                        <i class="fa fa-exchange text-muted" style="font-size: 48px;"></i>
                        <p class="text-muted mt-2">Select a match from the left to begin comparison.</p>
                    </div>
                </div>
            </div>
        </div>
    `);

    init_comparison_page(page);
};

function init_comparison_page(page) {
    let $matchList = $('#match-list');
    let $comparisonPane = $('#comparison-pane');
    let $emptyState = $('#empty-state');
    let $comparisonFields = $('#comparison-fields');
    let $btnMerge = $('#btn-merge');
    let $constituentSelect = $('#constituent-select');
    let $btnSearch = $('#btn-search-constituent');

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
                                <small>${match.details.full_name || match.details.name}</small><br>
                                <small class="text-muted">${match.details.email_id || ''}</small>
                            </div>
                        `);
                        $item.on('click', function() {
                            $('.match-item').removeClass('active');
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
        
        const bloo = match.bloomerang_data;
        const erp = match.erpnext_data;

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

    // 3. Handle Merge
    $btnMerge.on('click', function() {
        const activeMatch = $('.match-item.active').first();
        if (!activeMatch.length) {
            frappe.msgprint(__('Please select a match to merge.'));
            return;
        }

        const erpnext_id = activeMatch.data('id');

        // For this implementation, we'll extract the values from the current comparison view
        const updated_values = {};
        $('.comparison-row').each(function() {
            const label = $(this).find('.field-label').text().trim();
            const valBloo = $(this).find('.text-primary').text().trim();
            
            // Map UI labels back to ERPNext field names
            const field_map = {
                'Full Name': 'full_name',
                'Email': 'email_id',
                'Phone': 'phone'
            };
            
            if (field_map[label]) {
                // We want to merge the Bloomerang value into ERPNext
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
                        // Refresh the comparison view to show updated data
                        // In a real app, we'd re-fetch the contact
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
