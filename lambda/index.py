import awsgi
from flask import Flask
import os

app = Flask(__name__)

@app.route("/<path:text>")
def all(text):
    bucket_name = os.environ["bucket_name"]
    return f"Response inside of a Lambda on path {text}. The bucket name for this stack is {bucket_name}"

def handler(event, context):
    return awsgi.response(app, event, context)