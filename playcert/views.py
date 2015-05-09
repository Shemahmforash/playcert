from pyramid.view import view_config

import os
import eventful

api = eventful.API(os.environ['EVENTFUL_KEY'])

@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}

@view_config(route_name='events', renderer='templates/events.pt')
def events_view(request):
    events = api.call('/events/search', c='music', l='Lisbon', date='This week')
    return {'events': events['events']['event']}
