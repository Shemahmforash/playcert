var playcertApp = angular.module('playcertApp', [
  'ngRoute',
  'playcertControllers',
]);

playcertApp.config(['$routeProvider',
  function($routeProvider, $locationProvider) {
    $routeProvider.
      when('/playcert/:location', {
        templateUrl: 'static/partials/events.html',
        controller: 'EventListCtrl'
      }).
      when('/playcert', {
        templateUrl: 'static/partials/events.html',
        controller: 'EventListCtrl'
      }).
      otherwise({
        redirectTo: '/playcert/Lisbon'
      });
    // $locationProvider
    //   .html5Mode(true);
  }]);

