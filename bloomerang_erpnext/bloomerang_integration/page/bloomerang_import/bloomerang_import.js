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
            $status.html(`<pre class="text-danger">${JSON.stringify(r, null, 2)}</pre>`);
        },
        callback: function(r) {
            $status.html(`<pre>${JSON.stringify(r, null, 2)}</pre>`);
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
