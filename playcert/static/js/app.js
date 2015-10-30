var playcertApp = angular.module('playcertApp', [
  'ngRoute',
  'google.places',
  'playcertControllers',
]);

playcertApp.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
    $routeProvider.
      when('/events/:location', {
        templateUrl: 'static/partials/events.html',
        controller: 'EventListCtrl'
      }).
      when('/', {
        templateUrl: 'static/partials/home.html',
        controller: 'HomeCtrl'
      }).
      otherwise({
        redirectTo: '/'
      })
    $locationProvider
      .html5Mode(true);
  }]);

