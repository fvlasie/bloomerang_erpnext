frappe.pages['bloomerang_import'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Bloomerang Sync & Reconciliation',
        single_column: true
    });

    // Render page body directly
    $(page.main).html(`
        <div class="nav nav-tabs mb-4" style="border-bottom: 1px solid #d1d8dd;">
            <a class="nav-link active" href="#" onclick="frappe.set_route('bloomerang_import'); return false;">1. Fetch & Stage</a>
            <a class="nav-link" href="#" onclick="frappe.set_route('bloomerang_comparison'); return false;">2. Compare & Merge</a>
        </div>
        <div class="frappe-card p-4 my-3">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h5 class="m-0">Constituent Records</h5>
                <button id="btn-fetch-constituents-body" class="btn btn-primary btn-sm">
                    <i class="octicon octicon-sync me-1"></i> Fetch Constituents
                </button>
            </div>
            <div id="bloomerang-status" class="text-muted">Click "Fetch Constituents" to load records from Bloomerang.</div>
            <div id="bloomerang-table-container" class="mt-3"></div>
        </div>
    `);

    page.set_primary_action('Fetch Constituents', function() {
        fetchBloomerangData();
    }, 'octicon octicon-sync');

    $(page.main).find('#btn-fetch-constituents-body').on('click', function() {
        fetchBloomerangData();
    });
};

function fetchBloomerangData() {
    let $status = $('#bloomerang-status');
    let $container = $('#bloomerang-table-container');

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
            <thead>
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
