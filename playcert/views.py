from pyramid.view import view_config
from pyechonest import config, artist as echonest_artist, song as echonest_song
import os
import eventful
import redis
import datetime
import logging
import re
import sys
import requests
import event
import artist
import track
import random
import urllib
import dill

log = logging.getLogger(__name__)

config.ECHO_NEST_API_KEY = os.environ['ECHONEST_KEY']
api = eventful.API(os.environ['EVENTFUL_KEY'])
redisClient = redis.StrictRedis(host='localhost', port=6379, db=0)


@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}


@view_config(route_name='newevents', renderer='templates/events.pt')
def new_events_view(request):
    location = request.matchdict['location']
    today = datetime.date.today()
    events_redis_key = location + '.events.' + str(today)

    log.debug('location %s', location)

    # get events from redis
    events = redisClient.get(events_redis_key)

    events = dill.loads(events) if events else ''
    if not events:
        # or get the events from the eventful api
        events = api.call(
            '/events/search', c='music', l=location, date='This week'
        )
        # log.debug('api response: %s', events)

        events = simplify_events(events)
        log.debug('processed_events: %s', events)

        # and set them on redis
        redisClient.set(events_redis_key, dill.dumps(events))

    # now create the playlist
    playlist = create_playlist(events)

    return {
        'events': events,
        'playlist': playlist
    }


def simplify_events(events):

    evs = []

    for ev in events['events']['event']:
        log.debug('event %s', ev)
        eventObj = event.Event(ev['title'], ev['start_time'], ev['venue_name'])

        event_artist = find_artist_and_songs(eventObj, ev)

        if event_artist:
            eventObj.artist = event_artist

        evs.append(eventObj)

    return evs


def find_artist_and_songs(event, response):

    artist_name = ''
    if isinstance(response['performers'], dict):
        if isinstance(response['performers']['performer'], dict):
            artist_name = response['performers']['performer']['name']
        else:
            artist_name = response['performers']['performer'][0]['name']

    if not artist_name:
        # get artist from echonest api
        try:
            event_artist = echonest_artist.extract(
                text=event.title, results=1)
        except:
            log.error('could not find artist %s', sys.exc_info()[0])
            return

        log.debug('Event artist from echonest: %s', event_artist)
        if event_artist:
            artist_name = event_artist[0].name

    if not artist_name:
        return

    log.debug('artist name %s', artist_name)

    artistObj = artist.Artist(artist_name)
    try:
        artist_uri = urllib.quote(artist_name)
    except Exception:
        log.debug('error quoting artist_name')
        return

    uri = "http://api.thisdayinmusic.net/app/api/artists/%s" % artist_uri
    log.debug('uri %s', uri)

    try:
        request = requests.get(uri)
        artist_info = request.json()
    except Exception:
        log.error('could not reach thisdayinmusic api %s', sys.exc_info()[0])
        return

    log.debug('artist_info')
    log.debug(artist_info)

    log.debug('thisdayinmusic artist', artist_info)

    if 'data' in artist_info:
        tracks = []
        for song in artist_info['data']['tracks']['data']:
            tracks.append(track.Track(song['name'], song['spotifyId']))

        artistObj.songs = tracks
    else:
        # couldn't find artist in thisdayinmusic, trying echonest
        try:
            echonest_songs = echonest_song.search(
                artist=artist_name,
                buckets=['id:spotify-WW', 'tracks'],
                limit=True, results=1)

            log.debug('echonest_songs')
            log.debug(echonest_songs)

            tracks = []

            if echonest_songs:
                for s in echonest_songs:
                    t = s.get_tracks('spotify-WW')[0]

                    tracks.append(track.Track(s.title, t['foreign_id']))

            artistObj.songs = tracks
        except:
            log.error(
                'could not find songs in echonest %s',
                sys.exc_info()[0])

        pass

    return artistObj


def create_playlist(events):
    """ Creates a playlist string to be rendered
    """

    log.info('create_playlist')

    ids = []
    for event in events:
        # log.info('event %s', event.title)

        if not event.artist:
            continue

        artist = event.artist

        # log.info('artist %s', artist.name)

        if artist.songs:
            track = random.choice(artist.songs)

            # log.info('track %s - %s', track.name, track.spotifyId)

            ids.append(track.spotifyId)

    ids = ','.join(ids)

    # log.info('ids - %s', ids)

    # remove reference to spotify:track
    pattern = re.compile('spotify\:track\:')
    ids = pattern.sub('', ids)

    log.info('ids - %s', ids)

    return ids


def generate_playlist(songs):
    """ Creates a playlist string to be rendered
    """
    # just use the foreign id from songs
    ids = []
    for s in songs:
        ids.append(s['foreign_id'])

    ids = ','.join(ids)

    # remove reference to spotify:track
    pattern = re.compile('spotify\:track\:')
    ids = pattern.sub('', ids)

    return ids
