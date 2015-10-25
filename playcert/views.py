import datetime
import logging
import random

from pyramid.view import view_config
import os
import eventful
import re

from playcert.cache import cache_data
from playcert.lib.event import Event


log = logging.getLogger(__name__)

api = eventful.API(os.environ['EVENTFUL_KEY'])


@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}


@view_config(route_name='events', renderer='json')
def events_view(request):
    location = request.matchdict['location']
    today = str(datetime.date.today())

    data = {'location': location, 'today': today, 'request': request}

    events = get_events(**data)
    log.debug('events: %s', events)

    # could not find events in api, empty response
    if not events:
        # TODO: support empty response correctly in the template
        return {
            'events': [],
            'playlist': [],
            'location': location,
            'today': today
        }

    data['events'] = events
    playlist = create_playlist(**data)

    return {
        'events': events_for_json(events),
        'playlist': playlist,
        'location': location,
        'today': today
    }


def events_for_json(events):

    simplified_events = [
        {
            'title': event.title,
            'when': event.when,
            'venue': event.venue
        } for event in events]

    log.debug('simplified_events %s', simplified_events)

    return simplified_events


@cache_data(name='events')
def get_events(**kwargs):
    """
    Gets the events from the eventful API
    """
    events = api.call(
        '/events/search', c='music', l=kwargs['location'], date='This week'
    )

    if not events or int(events['total_items']) == 0:
        return []

    # simplify them
    return simplify_events(events, kwargs['request'])


def simplify_events(events, request):
    """
    Simplifies the eventful event list
    by instantiating a class for each event with specific data
    """

    event_list = events['events']['event']

    # eventful api does not respond with list when the result is just one item
    # so we force it to be a list
    if not isinstance(event_list, list):
        event_list = [event_list]

    # create a list with Event objects with the necessary data
    events = []
    for ev in event_list:
        artist_name = ''
        if isinstance(ev['performers'], dict):
            if isinstance(ev['performers']['performer'], dict):
                artist_name = ev['performers']['performer']['name']
            else:
                artist_name = ev['performers']['performer'][0]['name']

        log.debug('Event: %s -> artist: %s', ev['title'], artist_name)

        events.append(Event(
            ev['title'], ev['start_time'], ev['venue_name'], artist_name,
            request.redis))

    return events


@cache_data(name='playlist')
def create_playlist(**kwargs):
    """
    Creates a playlist string to be rendered
    """

    events = kwargs['events']
    log.info('create_playlist')

    # retrieve the ids from a random song of each event artist
    ids = [random.choice(
        event.artist.songs).spotify_id for event in events
        if event.artist and event.artist.songs]

    playlist = ','.join(ids)

    # log.info('ids - %s', ids)

    # remove reference to spotify:track
    pattern = re.compile('spotify\:track\:')
    playlist = pattern.sub('', playlist)

    log.info('playlist - %s', playlist)

    return playlist
