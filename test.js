pathname='/gds-data/v1/cluster-map.json'
if (pathname.startsWith('/')) {
    pathname = pathname.substring(1);
}
console.log(pathname)
var parts = pathname.split('/');
console.log(parts)
var baseurl = parts[0];
console.log(baseurl)