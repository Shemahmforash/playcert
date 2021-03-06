var playcertApp = angular.module('playcertApp', [
  'ngRoute',
  'google.places',
  'angularSpinner',
  'geolocation',
  'playcertControllers'
]);

playcertApp.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
    $routeProvider.
      when('/events/:location', {
        templateUrl: 'static/partials/events.html',
        controller: 'EventListCtrl'
      }).
      when('/', {
        templateUrl: 'static/partials/events.html',
        controller: 'HomeCtrl'
      }).
      when('/about', {
        templateUrl: 'static/partials/about.html',
        controller: 'AboutCtrl'
      }).
      otherwise({
        redirectTo: '/'
      })
    $locationProvider
      .html5Mode(true);
  }]);

