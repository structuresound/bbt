import * as fetchImportedViaES6Module from 'isomorphic-fetch';
function test_isomorphicFetchTestCases_ambient() {
    expectSuccess(fetch('http://localhost:3000/good'), 'Good response');
    fetch('http://localhost:3000/bad')
        .then((response) => {
        return response.text();
    })
        .catch((err) => {
    });
}
function test_isomorphicFetchTestCases_commonjs() {
    expectSuccess(fetchImportedViaCommonJS('http://localhost:3000/good'), 'Good response');
    fetchImportedViaCommonJS('http://localhost:3000/bad')
        .then((response) => {
        return response.text();
    })
        .catch((err) => {
    });
}
function test_isomorphicFetchTestCases_es6() {
    expectSuccess(fetchImportedViaES6Module('http://localhost:3000/good'), 'Good response');
    fetchImportedViaES6Module('http://localhost:3000/bad')
        .then((response) => {
        return response.text();
    })
        .catch((err) => {
    });
}
function test_whatwgTestCases_ambient() {
    var headers = new Headers();
    headers.append("Content-Type", "application/json");
    var requestOptions = {
        method: "POST",
        headers: headers,
        mode: 'same-origin',
        credentials: 'omit',
        cache: 'default'
    };
    expectSuccess(fetch('http://localhost:3000/poster', requestOptions), 'Post response:');
    var requestOptions = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        }
    };
    expectSuccess(fetch('http://localhost:3000/poster', requestOptions), 'Post response:');
    var requestOptions = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        }
    };
    var request = new Request('http://localhost:3000/poster', requestOptions);
    expectSuccess(fetch(request), 'Post response:');
}
function test_whatwgTestCases_commonjs() {
    var headers = new Headers();
    headers.append("Content-Type", "application/json");
    var requestOptions = {
        method: "POST",
        headers: headers,
        mode: 'same-origin',
        credentials: 'omit',
        cache: 'default'
    };
    expectSuccess(fetchImportedViaCommonJS('http://localhost:3000/poster', requestOptions), 'Post response:');
    var requestOptions = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        }
    };
    expectSuccess(fetchImportedViaCommonJS('http://localhost:3000/poster', requestOptions), 'Post response:');
    var requestOptions = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        }
    };
    var request = new Request('http://localhost:3000/poster', requestOptions);
    expectSuccess(fetchImportedViaCommonJS(request), 'Post response:');
}
function test_whatwgTestCases_es6() {
    var headers = new Headers();
    headers.append("Content-Type", "application/json");
    var requestOptions = {
        method: "POST",
        headers: headers,
        mode: 'same-origin',
        credentials: 'omit',
        cache: 'default'
    };
    expectSuccess(fetchImportedViaES6Module('http://localhost:3000/poster', requestOptions), 'Post response:');
    var requestOptions = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        }
    };
    expectSuccess(fetchImportedViaES6Module('http://localhost:3000/poster', requestOptions), 'Post response:');
    var requestOptions = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        }
    };
    var request = new Request('http://localhost:3000/poster', requestOptions);
    expectSuccess(fetchImportedViaES6Module(request), 'Post response:');
}
function expectSuccess(promise, responseText) {
    promise.then((response) => {
        return response.text();
    })
        .then((text) => {
    });
}
//# sourceMappingURL=isomorphic-fetch-tests.js.map