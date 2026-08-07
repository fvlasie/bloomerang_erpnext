frappe.pages['bloomerang_import'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Bloomerang Sync & Reconciliation',
        single_column: true
    });

    $(frappe.render_template('bloomerang_import', {})).appendTo(page.main);

    page.set_primary_action('Fetch Constituents', function() {
        fetchBloomerangData();
    }, 'octicon octicon-sync');
};

function fetchBloomerangData() {
    let $status = $('#bloomerang-status');
    let $container = $('#bloomerang-table-container');

    $status.text('Fetching records from Bloomerang...');
    $container.empty();

    frappe.call({
        method: 'bloomerang_erpnext.api.fetch_constituents',
        error: function(r) {
            let msg = r && r.message ? r.message : 'Invalid API credentials or network error. Please verify your Bloomerang Settings.';
            $status.html(`<span class="text-danger">${msg}</span>`);
        },
        callback: function(r) {
            if (r.error) {
                $status.html(`<span class="text-danger">${r.error}</span>`);
                return;
            }
            if (!r.message || !r.message.Result) {
                $status.html('<span class="text-danger">No data returned or invalid API credentials.</span>');
                return;
            }

            $status.text('Loaded ' + r.message.Result.length + ' constituents.');
            renderTable($container, r.message.Result);
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
